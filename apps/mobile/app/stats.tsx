/**
 * 筋トレ時間のグラフ（"/stats"）
 * -------------------------------------------------------------
 * 直近7日の「1日ごとの筋トレ時間（分）」を棒グラフで表示する。
 * ホームの「今週の合計」カードから開く。
 * 外部のグラフ用ライブラリは使わず、View + Reanimated で描く（フレンド画面と同じ方針）。
 */

import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MonoColors, MonoGlyph, MonoLayout } from '@/constants/mono-theme';
import type { DailyMinutes } from '@/lib/daily-minutes';
import { fetchDailyMinutes } from '@/services/workoutService';

/** 棒グラフの棒が伸びる最大の高さ */
const BAR_MAX = 150;
/** 0分の日に引く細い線の高さ */
const BAR_MIN = 3;

export default function StatsScreen() {
  const router = useRouter();
  const [days, setDays] = useState<DailyMinutes[] | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchDailyMinutes(7).then((d) => {
      if (alive) setDays(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const summary = useMemo(() => {
    const list = days ?? [];
    const total = list.reduce((sum, d) => sum + d.minutes, 0);
    return {
      total,
      activeDays: list.filter((d) => d.minutes > 0).length,
      // 少ない日数でも 0 にならないよう小数1桁（例: 3分 ÷ 7日 = 0.4分）
      average: list.length > 0 ? Math.round((total / list.length) * 10) / 10 : 0,
      max: Math.max(1, ...list.map((d) => d.minutes)),
    };
  }, [days]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel="戻る">
          <Feather name="chevron-left" size={24} color={MonoColors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>筋トレ時間</Text>
        <View style={{ width: 24 }} />
      </View>

      {!days ? (
        <View style={styles.center}>
          <ActivityIndicator color={MonoColors.ink} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.lead}>{MonoGlyph.star} 直近7日のようす</Text>

          <View style={styles.summaryRow}>
            <SummaryItem label="合計" value={summary.total} unit="分" />
            <SummaryItem label="1日平均" value={summary.average} unit="分" />
            <SummaryItem label="やった日" value={summary.activeDays} unit="日" />
          </View>

          <View style={styles.chartCard}>
            <View style={styles.chart}>
              {days.map((d, i) => (
                <View key={d.date} style={styles.column}>
                  <Text style={styles.valueLabel}>{d.minutes > 0 ? d.minutes : ''}</Text>
                  <View style={styles.barSlot}>
                    <Bar ratio={d.minutes / summary.max} hasValue={d.minutes > 0} today={d.isToday} delay={i * 60} />
                  </View>
                  <Text style={[styles.dayLabel, d.isToday && styles.dayLabelToday]}>{d.label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.unitNote}>単位：分（日本時間の1日ごと）</Text>
          </View>

          {summary.total === 0 && (
            <Text style={styles.emptyNote}>
              まだ記録がありません。{'\n'}筋トレを1回やると、ここにグラフが出ます。
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SummaryItem({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>
        {value}
        <Text style={styles.summaryUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

function Bar({
  ratio,
  hasValue,
  today,
  delay,
}: {
  ratio: number;
  hasValue: boolean;
  today: boolean;
  delay: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [progress, delay]);

  const target = hasValue ? Math.max(BAR_MIN, ratio * BAR_MAX) : BAR_MIN;
  const animatedStyle = useAnimatedStyle(() => ({ height: target * progress.value + BAR_MIN * (1 - progress.value) }));

  return (
    <Animated.View
      style={[
        styles.bar,
        hasValue ? (today ? styles.barToday : styles.barNormal) : styles.barEmpty,
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MonoColors.screenBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: MonoLayout.screenPadding,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: 2, color: MonoColors.ink },
  scroll: { paddingHorizontal: MonoLayout.screenPadding, paddingBottom: 48 },

  lead: { fontSize: 12, color: MonoColors.textSecondary, letterSpacing: 1, marginTop: 8, marginBottom: 14 },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryItem: {
    flex: 1,
    backgroundColor: MonoColors.surface,
    borderRadius: MonoLayout.radiusControl,
    borderWidth: 1,
    borderColor: MonoColors.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  summaryLabel: { fontSize: 11, color: MonoColors.textMuted },
  summaryValue: { fontSize: 24, fontWeight: '700', color: MonoColors.ink, marginTop: 2 },
  summaryUnit: { fontSize: 12, fontWeight: '400', color: MonoColors.textSecondary },

  chartCard: {
    backgroundColor: MonoColors.surface,
    borderRadius: MonoLayout.radiusCard,
    borderWidth: 1,
    borderColor: MonoColors.border,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 12,
  },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  column: { flex: 1, alignItems: 'center' },
  valueLabel: { height: 18, fontSize: 11, fontWeight: '700', color: MonoColors.inkSoft },
  barSlot: { height: BAR_MAX, justifyContent: 'flex-end', alignSelf: 'stretch', alignItems: 'center' },
  bar: { width: '70%', borderRadius: 6 },
  barNormal: { backgroundColor: MonoColors.textMuted },
  barToday: { backgroundColor: MonoColors.ink },
  barEmpty: { backgroundColor: MonoColors.border, borderRadius: 2 },
  dayLabel: { marginTop: 8, fontSize: 12, color: MonoColors.textSecondary },
  dayLabelToday: { fontWeight: '700', color: MonoColors.ink },
  unitNote: { marginTop: 12, fontSize: 10, color: MonoColors.textMuted, textAlign: 'right' },

  emptyNote: {
    marginTop: 20,
    fontSize: 13,
    lineHeight: 20,
    color: MonoColors.textSecondary,
    textAlign: 'center',
  },
});
