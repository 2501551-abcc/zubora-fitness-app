/**
 * メニュー選択画面（"/workout/menu"）
 * -------------------------------------------------------------
 * ホームの「筋トレを始める」からここへ来る。
 * DB（workout_menus）に登録された種目一覧を取得して表示し、
 * 選んだ種目に応じて遷移先を振り分ける。
 *   - analysisType === 'pose'  → /workout/pose-analysis（カメラでフォーム判定）
 *   - analysisType === 'timer' → /workout/prepare（既存の時間タイマー式）
 */

import { WorkoutColors, WorkoutLayout } from '@/constants/workout-theme';
import { tapImpact } from '@/lib/haptics';
import { fetchWorkoutMenus } from '@/services/workoutService';
import type { WorkoutMenuItem } from '@/types/workout';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WorkoutMenuScreen() {
  const router = useRouter();
  const [menus, setMenus] = useState<WorkoutMenuItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchWorkoutMenus().then((items) => {
      if (alive) setMenus(items);
    });
    return () => {
      alive = false;
    };
  }, []);

  const selectMenu = (item: WorkoutMenuItem) => {
    tapImpact();
    if (item.analysisType === 'pose') {
      router.push({
        pathname: '/workout/pose-analysis',
        params: {
          menuId: String(item.id),
          exerciseKey: item.exerciseKey,
          name: item.name,
          targetReps: String(item.targetReps ?? 10),
        },
      });
    } else {
      router.push('/workout/prepare');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.hello}>メニューを選ぶ</Text>
        <Text style={styles.title}>今日はどれをやる？</Text>
      </View>

      {menus === null && <ActivityIndicator style={{ marginTop: 40 }} color={WorkoutColors.primary} />}

      {menus !== null && menus.length === 0 && (
        <Text style={styles.empty}>
          メニューが登録されていません。{'\n'}supabase/migration_03_workout_menus.sql をSupabaseで実行してください。
        </Text>
      )}

      {menus?.map((item) => (
        <Pressable key={item.id} style={styles.card} onPress={() => selectMenu(item)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
            {item.analysisType === 'pose' && (
              <Text style={styles.cardBadge}>📷 カメラでフォーム判定・目標{item.targetReps}回</Text>
            )}
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
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
  empty: {
    marginTop: 40,
    textAlign: 'center',
    color: WorkoutColors.textMuted,
    lineHeight: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WorkoutColors.surface,
    borderWidth: 1,
    borderColor: WorkoutColors.border,
    borderRadius: WorkoutLayout.radiusControl,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: WorkoutColors.textPrimary,
  },
  cardDesc: {
    fontSize: 13,
    color: WorkoutColors.textSecondary,
    marginTop: 4,
  },
  cardBadge: {
    fontSize: 12,
    color: WorkoutColors.ink,
    marginTop: 8,
  },
  chevron: {
    fontSize: 24,
    color: WorkoutColors.primary,
    marginLeft: 8,
  },
});
