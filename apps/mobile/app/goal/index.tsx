/**
 * ロードマップ（"/goal"）
 * -------------------------------------------------------------
 * AIが分解した目標ツリー（大目標 → 中目標 → 週次タスク）を表示。
 * 生成直後は下書きの結果を、通常は保存済みを取得して描画する。
 * モノトーン基調 ＋ 星のあしらいで認証画面とトーンを統一。
 */

import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MonoColors, MonoGlyph, MonoLayout } from '@/constants/mono-theme';
import { goalDraft } from '@/lib/goal-draft';
import { tapImpact } from '@/lib/haptics';
import { fetchCurrentRoadmap, saveRoadmap } from '@/services/goalService';
import type { Roadmap } from '@/types/goal';

export default function GoalRoadmapScreen() {
  const router = useRouter();
  const [roadmap, setRoadmap] = useState<Roadmap | null>(() => goalDraft.getRoadmap());
  const [loading, setLoading] = useState(roadmap === null);
  const [starting, setStarting] = useState(false);

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
        <ActivityIndicator color={MonoColors.ink} />
      </SafeAreaView>
    );
  }

  if (!roadmap) {
    return (
      <SafeAreaView style={[styles.container, styles.centerAll]} edges={['top', 'bottom']}>
        <Text style={styles.emptyGlyph}>{MonoGlyph.ribbon}</Text>
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

  const start = async () => {
    if (!roadmap || starting) return;
    tapImpact();
    setStarting(true);
    try {
      await saveRoadmap(roadmap);
      goalDraft.reset();
      router.replace('/(tabs)');
    } catch (err) {
      console.warn('[goal] ロードマップの保存に失敗しました:', err);
      setStarting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Feather name="chevron-left" size={24} color={MonoColors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>ロードマップ</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>{MonoGlyph.sparkle} あなたのロードマップ</Text>
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

        <Pressable
          style={[styles.primaryButton, starting && styles.primaryButtonDisabled]}
          onPress={start}
          disabled={starting}>
          <View style={styles.primaryRow}>
            {starting ? (
              <ActivityIndicator size="small" color={MonoColors.onInk} />
            ) : (
              <Feather name="star" size={15} color={MonoColors.onInk} />
            )}
            <Text style={styles.primaryText}>
              {starting ? '保存しています…' : 'この目標ではじめる'}
            </Text>
          </View>
        </Pressable>
        <Pressable style={styles.ghostButton} onPress={regenerate} disabled={starting}>
          <Text style={styles.ghostText}>作り直す</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MonoColors.screenBg },
  centerAll: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: MonoLayout.screenPadding,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 2,
    color: MonoColors.ink,
  },

  scroll: {
    paddingHorizontal: MonoLayout.screenPadding,
    paddingTop: 8,
    paddingBottom: 40,
  },
  eyebrow: { fontSize: 12, color: MonoColors.textSecondary },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: MonoColors.ink,
    marginTop: 6,
  },
  rawInput: {
    fontSize: 12,
    color: MonoColors.textMuted,
    marginTop: 4,
    marginBottom: 24,
  },

  tree: {
    borderLeftWidth: 1.5,
    borderLeftColor: MonoColors.border,
    paddingLeft: 18,
    marginLeft: 6,
    gap: 14,
  },
  node: { position: 'relative' },
  dot: {
    position: 'absolute',
    left: -25,
    top: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: MonoColors.screenBg,
  },
  dotActive: { backgroundColor: MonoColors.ink },
  dotFuture: { backgroundColor: MonoColors.border },

  card: {
    backgroundColor: MonoColors.surface,
    borderWidth: 1,
    borderColor: MonoColors.border,
    borderRadius: MonoLayout.radiusCard,
    padding: 16,
  },
  cardFuture: { opacity: 0.75 },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  milestoneTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: MonoColors.ink,
  },
  weeks: { fontSize: 11, color: MonoColors.textMuted, marginLeft: 8 },
  desc: {
    fontSize: 12,
    color: MonoColors.textSecondary,
    lineHeight: 20,
    marginTop: 8,
  },

  task: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: MonoColors.surfaceAlt,
    borderRadius: MonoLayout.radiusControl,
    padding: 12,
    marginTop: 12,
  },
  taskTextWrap: { flex: 1 },
  taskWeek: { fontSize: 11, color: MonoColors.textMuted },
  taskTitle: { fontSize: 13, color: MonoColors.ink, marginTop: 2 },
  freq: {
    fontSize: 11,
    color: MonoColors.inkSoft,
    borderWidth: 1,
    borderColor: MonoColors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: MonoLayout.radiusPill,
    marginLeft: 8,
  },

  primaryButton: {
    backgroundColor: MonoColors.ink,
    borderRadius: MonoLayout.radiusControl,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryText: {
    color: MonoColors.onInk,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  ghostButton: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  ghostText: { color: MonoColors.textSecondary, fontSize: 14, fontWeight: '600' },

  emptyGlyph: { fontSize: 28, marginBottom: 12 },
  emptyTitle: { fontSize: 16, color: MonoColors.ink, marginBottom: 20 },
});
