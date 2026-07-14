/**
 * 筋トレ画面（"/workout/session"）
 * -------------------------------------------------------------
 *  - 準備画面で決めた時間を受け取り、残り時間を大きく表示。
 *  - 決めた分数ぶんだけ「減っていくバー」で進捗を可視化。
 *  - 一時停止 / 再開ができる。
 *  - 完了で結果を services.saveWorkoutSession() に渡し、サマリー画面へ。
 *  - 中断はホームへ戻る。
 *
 * タイマーは Date.now() ベースなので、再レンダリングや一時停止でも誤差が出ません。
 */

import { DepletingBar } from '@/components/workout/depleting-bar';
import { WorkoutColors, WorkoutLayout } from '@/constants/workout-theme';
import { formatTime } from '@/lib/format-time';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { saveWorkoutSession } from '@/services/workoutService';
import { LEVEL_LABELS, type WorkoutLevel, type WorkoutResult } from '@/types/workout';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TICK_MS = 200; // 表示更新の間隔（バーを滑らかに見せる）

export default function WorkoutSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ durationSec?: string; level?: string }>();

  // パラメータを安全にパース（不正値なら15分にフォールバック）
  const plannedSec = clampNumber(Number(params.durationSec), 60, 60 * 90, 15 * 60);
  const level = normalizeLevel(params.level);

  const [remainingSec, setRemainingSec] = useState(plannedSec);
  const [isRunning, setIsRunning] = useState(true);

  const startedAtRef = useRef(new Date().toISOString());
  const endTimeRef = useRef<number>(Date.now() + plannedSec * 1000); // 終了予定時刻(ms)
  const savedRef = useRef(false);

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

  // メインのカウントダウン。0になったら完了 → サマリーへ。
  useEffect(() => {
    if (!isRunning) return;

    const id = setInterval(() => {
      const left = Math.max(0, (endTimeRef.current - Date.now()) / 1000);
      setRemainingSec(left);
      if (left <= 0) {
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
  }, [isRunning, finish, router]);

  const togglePause = useCallback(() => {
    tapLight();
    setIsRunning((running) => {
      if (running) {
        // 一時停止：現在の残り時間を保持
        const left = Math.max(0, (endTimeRef.current - Date.now()) / 1000);
        setRemainingSec(left);
      } else {
        // 再開：残り時間から終了予定時刻を引き直す
        endTimeRef.current = Date.now() + remainingSec * 1000;
      }
      return !running;
    });
  }, [remainingSec]);

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

      {/* 残り時間 */}
      <View style={styles.center}>
        <Text style={styles.subLabel}>残り時間</Text>
        <Text style={styles.time}>{formatTime(remainingSec)}</Text>
        <Text style={styles.planned}>目標 {Math.round(plannedSec / 60)}分</Text>
      </View>

      {/* 減っていくバー */}
      <View style={styles.barSection}>
        <DepletingBar progress={progress} height={14} />
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
  subLabel: {
    color: WorkoutColors.soft,
    fontSize: 15,
    marginBottom: 10,
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
