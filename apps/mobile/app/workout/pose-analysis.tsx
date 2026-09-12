/**
 * フォーム判定画面（"/workout/pose-analysis"）
 * -------------------------------------------------------------
 * 筋トレタイマー画面（/workout/session）のヘッダーにある「スクワット」
 * ボタンから push で重なる形で開く。session側のタイマーはこの画面が
 * 開いている間もバックグラウンドで動き続ける（sessionを閉じていないため）。
 *
 * 目標回数は決めない。終了は以下のどちらか:
 *   - このボタンで自分から終了する
 *   - セッション全体の残り時間が0になる（このタイマー表示はあくまで目安。
 *     実際の終了処理は session.tsx 側のタイマーが担う）
 * 終了すると、結果をSupabase(workout_logs)に保存してサマリーを表示する。
 * 「セッションに戻る」でこの画面を閉じると、session.tsx（動き続けている）
 * か、既にタイマーが0になっていれば summary が router.back() で見える。
 *
 * 種目のロジック自体は cv/pose/ 以下（PoseFormEvaluator / exerciseConfig、
 * cv担当者の管理下）に切り出してあるので、このファイルは
 * 「カメラ描画とDB保存」だけを担当する。
 */

import { WorkoutColors, WorkoutLayout } from '@/constants/workout-theme';
import { tapImpact } from '@/lib/haptics';
import { savePoseAnalysisResult } from '@/services/workoutService';
// フォーム判定ロジックは cv/pose（cv担当者の管理フォルダ）に置かれている。
// apps/mobile からは相対パスで参照する（metro.config.js でcvフォルダを解決対象に追加済み）。
import { Landmark, PoseFormEvaluator, RepLog } from '../../../../cv/pose/PoseFormEvaluator';
import { EXERCISE_CONFIGS } from '../../../../cv/pose/exerciseConfig';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { Delegate, MediapipeCamera, RunningMode, usePoseDetection } from 'react-native-mediapipe';


import { Platform, View, Text, Pressable } from 'react-native';

// ...

export default function PoseAnalysisScreen() {
  // Webブラウザで動かしている時は、カメラを起動せずにダミーUIを表示する
  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#333' }}>
        <Text style={{ color: '#fff', fontSize: 18 }}>📷 [PC/Web表示モード]</Text>
        <Text style={{ color: '#aaa', marginTop: 8 }}>実機カメラの代わりにダミー表示中</Text>
        
        {/* 運動完了などのテスト用ボタンを作っておくと便利！ */}
        <Pressable 
          style={{ marginTop: 20, padding: 12, backgroundColor: '#4A90E2', borderRadius: 8 }}
          onPress={() => /* 完了処理や画面遷移のテスト */ {}}>
          <Text style={{ color: '#fff' }}>スクワット完了テスト</Text>
        </Pressable>
      </View>
    );
  }

  // 以下、本番のカメラ処理コード...
}


const POSE_MODEL = 'pose_landmarker_full.task';
// 目標回数を決めない運用にしたので、事実上「到達しない」大きな値にして
// PoseFormEvaluator側の自動終了（10回で切り上げる機能）を無効化する。
const NO_TARGET_REPS = 999999;

export default function PoseAnalysisScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    menuId?: string;
    exerciseKey?: string;
    name?: string;
    targetReps?: string;
    sessionEndTime?: string; // session.tsx から渡される、セッション全体の終了予定時刻(ms)
  }>();

  const menuId = params.menuId ? Number(params.menuId) : undefined;
  const exerciseKey = params.exerciseKey ?? 'squat';
  const displayName = params.name ?? 'スクワット';
  const targetRepsParam = Number(params.targetReps);
  const sessionEndTime = params.sessionEndTime ? Number(params.sessionEndTime) : null;

  const baseConfig = EXERCISE_CONFIGS[exerciseKey] ?? EXERCISE_CONFIGS.squat;
  // targetRepsが明示的に渡されていればそれを目標にする（今は使っていないが、
  // 将来メニュー経由の呼び出しを復活させたときのために残してある）。
  // 渡されていなければ「回数を決めない」運用として自動終了を無効化する。
  const config = {
    ...baseConfig,
    targetGoodReps:
      Number.isFinite(targetRepsParam) && targetRepsParam > 0 ? targetRepsParam : NO_TARGET_REPS,
  };

  const [count, setCount] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [advice, setAdvice] = useState('カメラを起動中...');
  const [isReady, setIsReady] = useState(false);
  const [sessionLog, setSessionLog] = useState<RepLog[] | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [remainingLabel, setRemainingLabel] = useState<string | null>(null);

  const savedRef = useRef(false);

  useEffect(() => {
    Camera.requestCameraPermission().then((status) => {
      setHasCameraPermission(status === 'granted');
    });
  }, []);

  // セッション全体の残り時間を、表示用に1秒ごと計算する。
  // 実際のタイマー処理（0になったときの終了・保存）はsession.tsx側が担っており、
  // この画面が開いている間もsession.tsxはバックグラウンドで動き続けている。
  useEffect(() => {
    if (sessionEndTime === null) return;

    const tick = () => {
      const leftSec = Math.max(0, Math.round((sessionEndTime - Date.now()) / 1000));
      const m = Math.floor(leftSec / 60);
      const s = leftSec % 60;
      setRemainingLabel(`残り ${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionEndTime]);

  const evaluatorRef = useRef<PoseFormEvaluator | null>(null);
  if (evaluatorRef.current === null) {
    evaluatorRef.current = new PoseFormEvaluator(config);
  }

  const handlePoseResults = useCallback(
    (results: { results: Array<{ landmarks: Array<Array<Landmark>> }> }) => {
      if (sessionLog !== null) return;

      const pose = results.results?.[0]?.landmarks?.[0];
      if (!pose || pose.length === 0) return;

      evaluatorRef.current!.processFrame(pose, (result) => {
        setIsReady(result.isReady);
        setAdvice(result.advice);
        if (result.score !== undefined) setScore(result.score);
        if (result.countIncrement) setCount((prev) => prev + 1);
        if (result.sessionFinished && result.sessionLog) {
          setSessionLog(result.sessionLog);
        }
      });
    },
    [sessionLog]
  );

  const poseDetection = usePoseDetection(
    {
      onResults: handlePoseResults,
      onError: (error) => {
        console.error('Pose detection error:', error);
        setAdvice('姿勢推定でエラーが発生しました');
      },
    },
    RunningMode.LIVE_STREAM,
    POSE_MODEL,
    {
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      delegate: Delegate.GPU,
      mirrorMode: 'mirror-front-only',
      fpsMode: 30,
    }
  );

  // セッション終了時に一度だけDBへ保存する
  useEffect(() => {
    if (sessionLog === null || savedRef.current) return;
    savedRef.current = true;

    const goodReps = sessionLog.filter((r) => r.isGoodForm).length;
    void savePoseAnalysisResult({
      menuId,
      totalReps: sessionLog.length,
      goodReps,
      repLog: sessionLog,
    });
  }, [sessionLog, menuId]);

  const backToSession = () => {
    tapImpact();
    // pushで重ねてきた画面を閉じる。下に残っているsession.tsx
    // （もしくは、その間にタイマーが0になっていればsummary）が表示される。
    router.back();
  };

  // 「終了する」ボタン：目標回数に関係なく、いつでも自分から終了できる
  const finishManually = () => {
    if (sessionLog !== null) return;
    tapImpact();
    const log = evaluatorRef.current?.endSession() ?? [];
    setSessionLog(log);
  };

  // --- セッション終了画面 ---
  if (sessionLog !== null) {
    const goodCount = sessionLog.filter((r) => r.isGoodForm).length;
    return (
      <View style={styles.summaryContainer}>
        <Text style={styles.summaryTitle}>お疲れさまでした！</Text>
        <Text style={styles.summarySub}>
          {displayName}　{sessionLog.length}回中 {goodCount}回、正しいフォームでした
        </Text>
        <ScrollView style={styles.summaryList}>
          {sessionLog.map((rep) => (
            <View key={rep.repNumber} style={styles.summaryRow}>
              <Text style={styles.summaryRepNum}>{rep.repNumber}回目</Text>
              <Text
                style={[styles.summaryScore, { color: rep.isGoodForm ? '#4CAF50' : '#F44336' }]}
              >
                {rep.score}点
              </Text>
              <Text style={styles.summaryAdvice}>{rep.advice}</Text>
            </View>
          ))}
        </ScrollView>
        <Pressable style={styles.backButton} onPress={backToSession}>
          <Text style={styles.backButtonText}>セッションに戻る</Text>
        </Pressable>
      </View>
    );
  }

  // --- カメラ権限待ち ---
  if (!hasCameraPermission) {
    return (
      <View style={styles.container}>
        <Text style={{ color: '#FFF' }}>カメラへのアクセスを許可してください</Text>
      </View>
    );
  }

  // --- 通常のトレーニング画面 ---
  return (
    <View style={styles.container}>
      <MediapipeCamera style={StyleSheet.absoluteFill} solution={poseDetection} activeCamera="front" />

      <View style={styles.overlay}>
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: isReady ? '#4CAF50' : '#F44336' }]}>
            <Text style={styles.badgeText}>{isReady ? 'READY' : 'NOT READY'}</Text>
          </View>
          {remainingLabel && (
            <View style={styles.remainingPill}>
              <Text style={styles.remainingPillText}>{remainingLabel}</Text>
            </View>
          )}
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>回数</Text>
            <Text style={styles.statValue}>{count} 回</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>スコア</Text>
            <Text style={styles.statValue}>{score !== null ? `${score}点` : '--'}</Text>
          </View>
        </View>
        <View style={{ width: '100%' }}>
          <View style={styles.adviceCard}>
            <Text style={styles.adviceText}>{advice}</Text>
          </View>
          <Pressable style={styles.finishButton} onPress={finishManually}>
            <Text style={styles.finishButtonText}>終了する</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, padding: 20, justifyContent: 'space-between', alignItems: 'center' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 40,
  },
  badge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  badgeText: { color: '#FFF', fontWeight: 'bold' },
  remainingPill: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  remainingPillText: { color: WorkoutColors.soft, fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-around' },
  statBox: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 15, borderRadius: 12, alignItems: 'center', width: '40%' },
  statLabel: { color: '#AAA', fontSize: 12 },
  statValue: { color: '#FFF', fontSize: 28, fontWeight: 'bold' },
  adviceCard: { backgroundColor: 'rgba(255,255,255,0.9)', padding: 20, borderRadius: 12, width: '100%', marginBottom: 12 },
  adviceText: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', color: '#333' },
  finishButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: WorkoutLayout.radiusControl,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  finishButtonText: { color: '#FFF', fontSize: 15, fontWeight: '600' },

  summaryContainer: { flex: 1, backgroundColor: '#111', paddingTop: 60, paddingHorizontal: 20 },
  summaryTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  summarySub: { color: '#AAA', fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  summaryList: { flex: 1 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  summaryRepNum: { color: '#FFF', width: 60, fontWeight: 'bold' },
  summaryScore: { width: 60, fontWeight: 'bold', fontSize: 16 },
  summaryAdvice: { color: '#DDD', flex: 1, fontSize: 12 },
  backButton: {
    backgroundColor: WorkoutColors.primary,
    borderRadius: WorkoutLayout.radiusControl,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  backButtonText: { color: WorkoutColors.onAccent, fontSize: 16, fontWeight: '700' },
});
