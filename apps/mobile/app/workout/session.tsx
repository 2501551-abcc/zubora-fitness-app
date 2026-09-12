/**
 * 筋トレ画面（"/workout/session"）
 * -------------------------------------------------------------
 *  - 準備画面で決めた時間を受け取り、残り時間を大きく表示。
 *  - 決めた分数ぶんだけ「減っていくバー」で進捗を可視化。
 *  - レベルに応じたローテーションで「今の種目」を表示し、種目のあいだに
 *    休憩を自動で挟む（constants/workout-sequence.ts）。
 *  - 選んだ時間は「運動時間」の予算。休憩中はこの予算を消費しない
 *    （休憩ぶんは実時間としては追加でかかる）。
 *  - 一時停止 / 再開ができる。
 *  - 完了で結果を services.saveWorkoutSession() に渡し、サマリー画面へ。
 *  - 中断はホームへ戻る。
 *
 * タイマーは Date.now() ベースなので、再レンダリングや一時停止でも誤差が出ません。
 */

import { DepletingBar } from '@/components/workout/depleting-bar';
import { WorkoutColors, WorkoutLayout } from '@/constants/workout-theme';
import {
  buildWorkoutSequence,
  exerciseElapsedAt,
  findSegmentAt,
} from '@/constants/workout-sequence';
import { formatTime } from '@/lib/format-time';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { saveWorkoutSession } from '@/services/workoutService';
import { LEVEL_LABELS, type WorkoutLevel, type WorkoutResult } from '@/types/workout';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';

const TICK_MS = 200; // 表示更新の間隔（バーを滑らかに見せる）

export default function WorkoutSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    durationSec?: string;
    level?: string;
    firstExercise?: string;
  }>();

  // パラメータを安全にパース（不正値なら15分にフォールバック）
  const plannedSec = clampNumber(Number(params.durationSec), 60, 60 * 90, 15 * 60);
  const level = normalizeLevel(params.level);
  // 目標ロードマップの今週のタスクがあれば、最初の1種目をそれに差し替える（prepare.tsx参照）
  const firstExercise = params.firstExercise || undefined;

  // レベル×合計時間から一度だけ組み立てる（種目 → 休憩 → 種目 …、休憩込みの実時間座標）
  const segments = useMemo(
    () => buildWorkoutSequence(plannedSec, level, firstExercise),
    [plannedSec, level, firstExercise],
  );
  const totalSec = segments.length > 0 ? segments[segments.length - 1].endSec : plannedSec;

  // realElapsedSec = 休憩も含めた実時間の経過（セグメント切り替えの基準）
  const [realElapsedSec, setRealElapsedSec] = useState(0);
  const [isRunning, setIsRunning] = useState(true);

  const currentSegment = findSegmentAt(segments, realElapsedSec);
  const segmentRemainingSec = Math.max(0, currentSegment.endSec - realElapsedSec);
  // 運動セグメントの消化量だけを積算＝休憩中は増えない「運動時間の残り」
  const exerciseElapsedSec = exerciseElapsedAt(segments, realElapsedSec);
  const remainingSec = Math.max(0, plannedSec - exerciseElapsedSec);

  const startedAtRef = useRef(new Date().toISOString());
  // 実時間の経過は「一時停止までの積算(elapsedBaseRef) + 今回の run 開始からの経過」で計算する
  const elapsedBaseRef = useRef(0);
  const runStartRef = useRef<number>(Date.now());
  const savedRef = useRef(false);
  const lastSegmentStartRef = useRef(currentSegment.startSec);

  // 種目 ⇔ 休憩の切り替わりを軽い振動で知らせる（画面を見ていなくても気づけるように）
  useEffect(() => {
    if (currentSegment.startSec !== lastSegmentStartRef.current) {
      lastSegmentStartRef.current = currentSegment.startSec;
      tapLight();
    }
  }, [currentSegment.startSec]);

  // 結果を確定してサービス層へ（保存はバックエンドが実装）
  const finish = useCallback(
    (completed: boolean, remaining: number): WorkoutResult => {
      const result: WorkoutResult = {
        startedAt: startedAtRef.current,
        endedAt: new Date().toISOString(),
        plannedSec,
        completedSec: Math.round(plannedSec - remaining),
        level,
        completed,
      };
      if (!savedRef.current) {
        savedRef.current = true;
        void saveWorkoutSession(result); // 非同期。UI はブロックしない。
      }
      return result;
    },
    [plannedSec, level],
  );

  // メインのカウントダウン（実時間ベース）。全セグメントを消化したら完了 → サマリーへ。
  useEffect(() => {
    if (!isRunning) return;

    const id = setInterval(() => {
      const elapsed = elapsedBaseRef.current + (Date.now() - runStartRef.current) / 1000;
      const clamped = Math.min(elapsed, totalSec);
      setRealElapsedSec(clamped);
      if (clamped >= totalSec) {
        clearInterval(id);
        setIsRunning(false);
        const result = finish(true, 0);
        notifySuccess();
        router.replace({
          pathname: '/workout/summary',
          params: {
            plannedSec: String(result.plannedSec),
            completedSec: String(result.completedSec),
            level: result.level,
            completed: '1',
          },
        });
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, [isRunning, finish, router, totalSec]);

  const togglePause = useCallback(() => {
    tapLight();
    setIsRunning((running) => {
      if (running) {
        // 一時停止：これまでの実経過を積算しておく
        elapsedBaseRef.current += (Date.now() - runStartRef.current) / 1000;
      } else {
        // 再開：ここからの経過を新たに計測する
        runStartRef.current = Date.now();
      }
      return !running;
    });
  }, []);

  const quit = useCallback(() => {
    finish(false, remainingSec); // 途中終了として記録
    router.replace('/(tabs)');
  }, [finish, remainingSec, router]);

  const progress = plannedSec > 0 ? remainingSec / plannedSec : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.levelTag}>{LEVEL_LABELS[level]}</Text>
        <Pressable onPress={quit} hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      {/* 今の種目 / 休憩 + そのセグメントの残り時間 */}
      <View style={styles.center}>
        <View
          style={[
            styles.segmentTag,
            currentSegment.type === 'rest' && styles.segmentTagRest,
          ]}>
          <Text style={styles.segmentTagText}>
            {currentSegment.type === 'rest' ? '休憩中' : 'いまの種目'}
          </Text>
        </View>
        <Text style={styles.exerciseName}>{currentSegment.name}</Text>
        <Text style={styles.time}>{formatTime(segmentRemainingSec)}</Text>
        <Text style={styles.planned}>
          運動の残り {formatTime(remainingSec)}（目標 {Math.round(plannedSec / 60)}分・休憩は含まず）
        </Text>
      </View>

      {/* 減っていくバー */}
      <View style={styles.barSection}>
        <DepletingBar
          progress={progress}
          height={14}
          trackColor={WorkoutColors.ink}
          fillColor={WorkoutColors.accent}
        />
        <View style={styles.barLabels}>
          <Text style={styles.barLabelText}>0:00</Text>
          <Text style={styles.barLabelText}>{formatTime(plannedSec)}</Text>
        </View>
      </View>

      {/* 操作ボタン */}
      <View style={styles.controls}>
        <Pressable style={styles.secondaryButton} onPress={togglePause}>
          <Text style={styles.secondaryText}>{isRunning ? '一時停止' : '再開'}</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={quit}>
          <Text style={styles.primaryText}>終了する</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/* ---------- ヘルパー ---------- */

function clampNumber(v: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function normalizeLevel(v: string | undefined): WorkoutLevel {
  return v === 'easy' || v === 'normal' || v === 'hard' ? v : 'normal';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WorkoutColors.deep,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  levelTag: {
    color: WorkoutColors.soft,
    fontSize: 13,
    backgroundColor: WorkoutColors.ink,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  close: {
    color: WorkoutColors.soft,
    fontSize: 22,
  },
  center: {
    alignItems: 'center',
  },
  segmentTag: {
    backgroundColor: WorkoutColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  segmentTagRest: {
    backgroundColor: WorkoutColors.ink,
  },
  segmentTagText: {
    color: WorkoutColors.onAccent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  time: {
    color: '#FFFFFF',
    fontSize: 76,
    fontWeight: '700',
    letterSpacing: 1,
  },
  planned: {
    color: WorkoutColors.soft,
    fontSize: 14,
    marginTop: 8,
  },
  barSection: {
    gap: 8,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabelText: {
    color: WorkoutColors.soft,
    fontSize: 12,
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: WorkoutLayout.radiusControl,
    borderWidth: 1,
    borderColor: WorkoutColors.ink,
  },
  secondaryText: {
    color: WorkoutColors.mist,
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: WorkoutLayout.radiusControl,
    backgroundColor: WorkoutColors.primary,
  },
  primaryText: {
    color: WorkoutColors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
});
