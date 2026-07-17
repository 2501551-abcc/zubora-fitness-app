/**
 * ホーム画面（タブの "/"）
 * -------------------------------------------------------------
 * アプリのハブ。「筋トレを始める」で準備画面へ、「目標ロードマップ」でツリーへ。
 * 連続日数などの実データはサービス層(スタブ)から取得。
 */

import { WorkoutColors, WorkoutLayout } from '@/constants/workout-theme';
import { tapImpact } from '@/lib/haptics';
import { fetchStreakDays } from '@/services/workoutService';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchStreakDays().then((n) => {
      if (alive) setStreak(n);
    });
    return () => {
      alive = false;
    };
  }, []);

  const startWorkout = () => {
    tapImpact();
    router.push('/workout/prepare');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.hello}>こんにちは</Text>
        <Text style={styles.title}>今日もゆるっといこう</Text>
      </View>

      {/* 実績 */}
      <View style={styles.stats}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {streak ?? '—'}
            <Text style={styles.statUnit}> 日</Text>
          </Text>
          <Text style={styles.statLabel}>連続記録</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            38<Text style={styles.statUnit}> 分</Text>
          </Text>
          <Text style={styles.statLabel}>今週の合計</Text>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      {/* 目標ロードマップへの導線 */}
      <Pressable style={styles.goalLink} onPress={() => router.push('/goal')}>
        <View>
          <Text style={styles.goalLinkTitle}>目標ロードマップ</Text>
          <Text style={styles.goalLinkSub}>今の目標を見る</Text>
        </View>
        <Text style={styles.goalChevron}>›</Text>
      </Pressable>

      {/* メインCTA */}
      <Pressable style={styles.cta} onPress={startWorkout}>
        <Text style={styles.ctaText}>筋トレを始める</Text>
        <Text style={styles.ctaSub}>開いたら15秒で時間を決めよう</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WorkoutColors.screenBg,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 16,
    marginBottom: 20,
  },
  hello: {
    fontSize: 14,
    color: WorkoutColors.textSecondary,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: WorkoutColors.textPrimary,
    marginTop: 4,
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
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    color: WorkoutColors.textPrimary,
  },
  statUnit: {
    fontSize: 13,
    fontWeight: '400',
    color: WorkoutColors.textSecondary,
  },
  statLabel: {
    fontSize: 12,
    color: WorkoutColors.textMuted,
    marginTop: 6,
  },
  goalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WorkoutColors.surface,
    borderWidth: 1,
    borderColor: WorkoutColors.border,
    borderRadius: WorkoutLayout.radiusControl,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  goalLinkTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: WorkoutColors.textPrimary,
  },
  goalLinkSub: {
    fontSize: 12,
    color: WorkoutColors.textSecondary,
    marginTop: 2,
  },
  goalChevron: {
    fontSize: 24,
    color: WorkoutColors.primary,
  },
  cta: {
    backgroundColor: WorkoutColors.primary,
    borderRadius: WorkoutLayout.radiusCard,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 24,
  },
  ctaText: {
    color: WorkoutColors.onAccent,
    fontSize: 20,
    fontWeight: '700',
  },
  ctaSub: {
    color: WorkoutColors.onAccent,
    fontSize: 13,
    marginTop: 6,
    opacity: 0.8,
  },
})
