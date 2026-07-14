/**
 * 記録サマリー画面（"/workout/summary"）
 * -------------------------------------------------------------
 * 筋トレ完了後に表示。実施時間・目標・連続日数を見せてモチベを保つ。
 * フロー図の「筋トレ終了 → 目標ロード」へ繋ぐ導線を用意。
 */

import { WorkoutColors, WorkoutLayout } from '@/constants/workout-theme';
import { tapImpact } from '@/lib/haptics';
import { fetchStreakDays } from '@/services/workoutService';
import { LEVEL_LABELS, type WorkoutLevel } from '@/types/workout';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WorkoutSummaryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    plannedSec?: string;
    completedSec?: string;
    level?: string;
    completed?: string;
  }>();

  const plannedMin = Math.round(safeNumber(params.plannedSec) / 60);
  const completedMin = Math.max(1, Math.round(safeNumber(params.completedSec) / 60));
  const level = normalizeLevel(params.level);
  const completed = params.completed === '1';

  const [streak, setStreak] = useState<number | null>(null);

  // 連続日数を取得（保存後の集計はバックエンドが実装）
  useEffect(() => {
    let alive = true;
    fetchStreakDays().then((n) => {
      if (alive) setStreak(n);
    });
    return () => {
      alive = false;
    };
  }, []);

  const goToGoal = () => {
    tapImpact();
    // TODO(nav): 目標ロード画面ができたら '/goal' などへ差し替え。
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <View style={styles.badge}>
          <Text style={styles.badgeMark}>✓</Text>
        </View>
        <Text style={styles.title}>{completed ? 'おつかれさま！' : 'ナイスファイト！'}</Text>
        <Text style={styles.subtitle}>
          {completed ? '今日のぶん、やりきったね' : 'ちょっとでも動けたのが偉い'}
        </Text>
      </View>

      {/* 実績カード */}
      <View style={styles.stats}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {completedMin}
            <Text style={styles.statUnit}> 分</Text>
          </Text>
          <Text style={styles.statLabel}>実施時間</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {plannedMin}
            <Text style={styles.statUnit}> 分</Text>
          </Text>
          <Text style={styles.statLabel}>目標</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {streak ?? '—'}
            <Text style={styles.statUnit}> 日</Text>
          </Text>
          <Text style={styles.statLabel}>連続</Text>
        </View>
      </View>

      <View style={styles.levelRow}>
        <Text style={styles.levelText}>強度：{LEVEL_LABELS[level]}</Text>
      </View>

      {/* アクション */}
      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={goToGoal}>
          <Text style={styles.primaryText}>目標をチェックする</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.secondaryText}>ホームへ戻る</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/* ---------- ヘルパー ---------- */

function safeNumber(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeLevel(v: string | undefined): WorkoutLevel {
  return v === 'easy' || v === 'normal' || v === 'hard' ? v : 'normal';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WorkoutColors.screenBg,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  top: {
    alignItems: 'center',
    marginTop: 24,
  },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: WorkoutColors.mist,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  badgeMark: {
    fontSize: 44,
    fontWeight: '700',
    color: WorkoutColors.primary,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: WorkoutColors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: WorkoutColors.textSecondary,
    marginTop: 8,
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: WorkoutColors.surface,
    borderWidth: 1,
    borderColor: WorkoutColors.border,
    borderRadius: WorkoutLayout.radiusControl,
    paddingVertical: 20,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 30,
    fontWeight: '700',
    color: WorkoutColors.textPrimary,
  },
  statUnit: {
    fontSize: 14,
    fontWeight: '400',
    color: WorkoutColors.textSecondary,
  },
  statLabel: {
    fontSize: 12,
    color: WorkoutColors.textMuted,
    marginTop: 6,
  },
  levelRow: {
    alignItems: 'center',
  },
  levelText: {
    fontSize: 14,
    color: WorkoutColors.textSecondary,
  },
  actions: {
    gap: 12,
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: WorkoutColors.primary,
    borderRadius: WorkoutLayout.radiusControl,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {
    color: WorkoutColors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
});
