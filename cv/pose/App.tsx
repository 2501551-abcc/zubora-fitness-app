import React, { useState, useRef, useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { usePoseDetection, RunningMode, Delegate, MediapipeCamera } from 'react-native-mediapipe';
import { PoseFormEvaluator, Landmark, RepLog } from './PoseFormEvaluator';
import { SQUAT_CONFIG } from './exerciseConfig';

const POSE_MODEL = 'pose_landmarker_lite.task';

export default function App() {
  const [count, setCount] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [advice, setAdvice] = useState('カメラを起動中...');
  const [isReady, setIsReady] = useState(false);
  const [sessionLog, setSessionLog] = useState<RepLog[] | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);

  useEffect(() => {
    Camera.requestCameraPermission().then((status) => {
      setHasCameraPermission(status === 'granted');
    });
  }, []);

  const evaluatorRef = useRef<PoseFormEvaluator | null>(null);
  if (evaluatorRef.current === null) {
    evaluatorRef.current = new PoseFormEvaluator(SQUAT_CONFIG);
  }

  const handlePoseResults = useCallback(
    (results: { results: Array<{ landmarks: Array<Array<Landmark>> }> }) => {
      // セッション終了後は姿勢推定結果を一切処理しない
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

  // --- セッション終了画面 ---
  if (sessionLog !== null) {
    const goodCount = sessionLog.filter((r) => r.isGoodForm).length;
    return (
      <View style={styles.summaryContainer}>
        <Text style={styles.summaryTitle}>お疲れさまでした！</Text>
        <Text style={styles.summarySub}>
          {sessionLog.length}回中 {goodCount}回、正しいフォームでした
        </Text>
        <ScrollView style={styles.summaryList}>
          {sessionLog.map((rep) => (
            <View key={rep.repNumber} style={styles.summaryRow}>
              <Text style={styles.summaryRepNum}>{rep.repNumber}回目</Text>
              <Text
                style={[
                  styles.summaryScore,
                  { color: rep.isGoodForm ? '#4CAF50' : '#F44336' },
                ]}
              >
                {rep.score}点
              </Text>
              <Text style={styles.summaryAdvice}>{rep.advice}</Text>
            </View>
          ))}
        </ScrollView>
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
      <MediapipeCamera
        style={StyleSheet.absoluteFill}
        solution={poseDetection}
        activeCamera="front"
      />

      <View style={styles.overlay}>
        <View style={[styles.badge, { backgroundColor: isReady ? '#4CAF50' : '#F44336' }]}>
          <Text style={styles.badgeText}>{isReady ? 'READY' : 'NOT READY'}</Text>
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
        <View style={styles.adviceCard}>
          <Text style={styles.adviceText}>{advice}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, padding: 20, justifyContent: 'space-between', alignItems: 'center' },
  badge: { marginTop: 40, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  badgeText: { color: '#FFF', fontWeight: 'bold' },
  statsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-around' },
  statBox: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 15, borderRadius: 12, alignItems: 'center', width: '40%' },
  statLabel: { color: '#AAA', fontSize: 12 },
  statValue: { color: '#FFF', fontSize: 28, fontWeight: 'bold' },
  adviceCard: { backgroundColor: 'rgba(255,255,255,0.9)', padding: 20, borderRadius: 12, width: '100%', marginBottom: 20 },
  adviceText: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', color: '#333' },

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
});
