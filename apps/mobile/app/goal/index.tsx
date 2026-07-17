/**
 * ロードマップ（"/goal"）
 * -------------------------------------------------------------
 * AIが分解した目標ツリー（大目標 → 中目標 → 週次タスク）を表示。
 * 生成直後は下書きの結果を、通常は保存済みを取得して描画する。
 */

import { WorkoutColors, WorkoutLayout } from '@/constants/workout-theme';
import { goalDraft } from '@/lib/goal-draft';
import { tapImpact } from '@/lib/haptics';
import { fetchCurrentRoadmap } from '@/services/goalService';
import type { Roadmap } from '@/types/goal';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function GoalRoadmapScreen() {
  const router = useRouter();
  const [roadmap, setRoadmap] = useState<Roadmap | null>(() => goalDraft.getRoadmap());
  const [loading, setLoading] = useState(roadmap === null);

  // 下書きに無ければ保存済みを取得
  useEffect(() => {
    if (roadmap) return;
    let alive = true;
    fetchCurrentRoadmap().then((r) => {
      if (!alive) return;
      setRoadmap(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [roadmap]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centerAll]}>
        <ActivityIndicator color={WorkoutColors.primary} />
      </SafeAreaView>
    );
  }

  if (!roadmap) {
    return (
      <SafeAreaView style={[styles.container, styles.centerAll]}>
        <Text style={styles.emptyTitle}>まだ目標がありません</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/goal/create')}>
          <Text style={styles.primaryText}>目標をつくる</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const regenerate = () => {
    tapImpact();
    goalDraft.reset();
    router.push('/goal/create');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>あなたのロードマップ</Text>
        <Text style={styles.title}>{roadmap.title}</Text>
        <Text style={styles.rawInput}>“{roadmap.user_input_raw}” から</Text>

        <View style={styles.tree}>
          {roadmap.milestones.map((m, i) => {
            const isFirst = i === 0;
            return (
              <View key={m.milestone_id} style={styles.node}>
                <View style={[styles.dot, isFirst ? styles.dotActive : styles.dotFuture]} />
                <View style={[styles.card, !isFirst && styles.cardFuture]}>
                  <View style={styles.cardHead}>
                    <Text style={styles.milestoneTitle}>{m.title}</Text>
                    <Text style={styles.weeks}>{m.period_weeks}週</Text>
                  </View>
                  {m.description ? <Text style={styles.desc}>{m.description}</Text> : null}

                  {m.tasks.map((t) => (
                    <View key={t.task_id} style={styles.task}>
                      <View style={styles.taskTextWrap}>
                        <Text style={styles.taskWeek}>WEEK {t.week_number}</Text>
                        <Text style={styles.taskTitle}>{t.title}</Text>
                      </View>
                      <Text style={styles.freq}>週{t.frequency_per_week}回</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        <Pressable style={styles.primaryButton} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.primaryText}>この目標ではじめる</Text>
        </Pressable>
        <Pressable style={styles.ghostButton} onPress={regenerate}>
          <Text style={styles.ghostText}>作り直す</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WorkoutColors.screenBg,
  },
  centerAll: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
  },
  eyebrow: {
    fontSize: 12,
    color: WorkoutColors.primary,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: WorkoutColors.textPrimary,
    marginTop: 4,
  },
  rawInput: {
    fontSize: 12,
    color: WorkoutColors.textMuted,
    marginTop: 4,
    marginBottom: 20,
  },
  tree: {
    borderLeftWidth: 2,
    borderLeftColor: WorkoutColors.soft,
    paddingLeft: 18,
    marginLeft: 6,
    gap: 14,
  },
  node: {
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    left: -25,
    top: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: WorkoutColors.screenBg,
  },
  dotActive: {
    backgroundColor: WorkoutColors.primary,
  },
  dotFuture: {
    backgroundColor: WorkoutColors.soft,
  },
  card: {
    backgroundColor: WorkoutColors.surface,
    borderWidth: 1,
    borderColor: WorkoutColors.border,
    borderRadius: 16,
    padding: 15,
  },
  cardFuture: {
    opacity: 0.9,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  milestoneTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: WorkoutColors.textPrimary,
  },
  weeks: {
    fontSize: 11,
    color: WorkoutColors.textMuted,
    marginLeft: 8,
  },
  desc: {
    fontSize: 12,
    color: WorkoutColors.textSecondary,
    lineHeight: 20,
    marginTop: 8,
  },
  task: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WorkoutColors.deep,
    borderRadius: 12,
    padding: 11,
    marginTop: 12,
  },
  taskTextWrap: {
    flex: 1,
  },
  taskWeek: {
    fontSize: 11,
    color: WorkoutColors.textMuted,
  },
  taskTitle: {
    fontSize: 13,
    color: WorkoutColors.textPrimary,
    marginTop: 2,
  },
  freq: {
    fontSize: 11,
    color: WorkoutColors.primary,
    borderWidth: 1,
    borderColor: WorkoutColors.soft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 8,
  },
  primaryButton: {
    backgroundColor: WorkoutColors.primary,
    borderRadius: WorkoutLayout.radiusControl,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryText: {
    color: WorkoutColors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  ghostButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  ghostText: {
    color: WorkoutColors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 16,
    color: WorkoutColors.textPrimary,
    marginBottom: 20,
  },
});
