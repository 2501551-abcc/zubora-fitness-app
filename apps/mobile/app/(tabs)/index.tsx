/**
 * ホーム画面（タブの "/"）
 * -------------------------------------------------------------
 * アプリのハブ。「筋トレを始める」で準備画面へ、目標ロードマップへの導線、
 * 下部の横並びメニューバー（ホーム / 目標 / フレンド / 設定）。
 * モノトーン基調 ＋ 星のあしらいで認証画面とトーンを統一。
 */

import { Feather } from '@expo/vector-icons';
import type { User } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MonoColors, MonoGlyph, MonoLayout } from '@/constants/mono-theme';
import { tapImpact, tapLight } from '@/lib/haptics';
import { fetchStreakDays } from '@/services/workoutService';
import { supabase } from '@/supabase';

export default function HomeScreen() {
  const router = useRouter();
  const [streak, setStreak] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (alive) setUser(session?.user ?? null);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setUser(session?.user ?? null);
    });
    fetchStreakDays().then((n) => {
      if (alive) setStreak(n);
    });

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const nickname =
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split('@')[0] ??
    null;

  const startWorkout = () => {
    tapImpact();
    router.push('/workout/prepare');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Feather name="star" size={18} color={MonoColors.ink} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.hello}>
              {nickname ? `${nickname} さん` : 'ようこそ'}
            </Text>
            <Text style={styles.title}>今日もゆるっといこう</Text>
          </View>
          {user ? (
            <Pressable
              style={styles.iconButton}
              hitSlop={8}
              onPress={() => {
                tapLight();
                router.push('/settings');
              }}>
              <Feather name="settings" size={18} color={MonoColors.inkSoft} />
            </Pressable>
          ) : (
            <Pressable
              style={styles.loginPill}
              onPress={() => {
                tapLight();
                router.push('/auth');
              }}>
              <Text style={styles.loginPillText}>ログイン</Text>
            </Pressable>
          )}
        </View>

        {/* 実績 */}
        <View style={styles.stats}>
          <View style={styles.statCard}>
            <Text style={styles.statTop}>
              {MonoGlyph.star} 連続記録
            </Text>
            <Text style={styles.statValue}>
              {streak ?? '—'}
              <Text style={styles.statUnit}> 日</Text>
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statTop}>今週の合計</Text>
            <Text style={styles.statValue}>
              38<Text style={styles.statUnit}> 分</Text>
            </Text>
          </View>
        </View>

        <View style={styles.spacer} />

        {/* 目標ロードマップ導線 */}
        <Pressable style={styles.goalLink} onPress={() => router.push('/goal')}>
          <View style={styles.goalIcon}>
            <Feather name="flag" size={16} color={MonoColors.ink} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.goalTitle}>目標ロードマップ</Text>
            <Text style={styles.goalSub}>今の目標をチェックする</Text>
          </View>
          <Feather name="chevron-right" size={20} color={MonoColors.textMuted} />
        </Pressable>

        {/* メインCTA */}
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={startWorkout}>
          <View style={styles.ctaRow}>
            <Feather name="star" size={16} color={MonoColors.onInk} />
            <Text style={styles.ctaText}>筋トレを始める</Text>
          </View>
          <Text style={styles.ctaSub}>開いたら15秒で時間を決めよう</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MonoColors.screenBg },
  content: {
    flex: 1,
    paddingHorizontal: MonoLayout.screenPadding,
    paddingTop: 12,
  },
  flex: { flex: 1 },
  spacer: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: MonoLayout.radiusPill,
    borderWidth: 1,
    borderColor: MonoColors.border,
    backgroundColor: MonoColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  hello: { fontSize: 12, color: MonoColors.textSecondary },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: MonoColors.ink,
    marginTop: 2,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: MonoLayout.radiusPill,
    borderWidth: 1,
    borderColor: MonoColors.border,
    backgroundColor: MonoColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: MonoLayout.radiusPill,
    backgroundColor: MonoColors.ink,
  },
  loginPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: MonoColors.onInk,
    letterSpacing: 0.5,
  },

  stats: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: MonoColors.surface,
    borderWidth: 1,
    borderColor: MonoColors.border,
    borderRadius: MonoLayout.radiusCard,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  statTop: {
    fontSize: 11,
    fontWeight: '600',
    color: MonoColors.textSecondary,
    marginBottom: 8,
  },
  statValue: { fontSize: 28, fontWeight: '800', color: MonoColors.ink },
  statUnit: { fontSize: 13, fontWeight: '400', color: MonoColors.textSecondary },

  goalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: MonoColors.surface,
    borderWidth: 1,
    borderColor: MonoColors.border,
    borderRadius: MonoLayout.radiusCard,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  goalIcon: {
    width: 34,
    height: 34,
    borderRadius: MonoLayout.radiusPill,
    backgroundColor: MonoColors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalTitle: { fontSize: 15, fontWeight: '700', color: MonoColors.ink },
  goalSub: { fontSize: 12, color: MonoColors.textSecondary, marginTop: 2 },

  cta: {
    backgroundColor: MonoColors.ink,
    borderRadius: MonoLayout.radiusCard,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  ctaPressed: { opacity: 0.85 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaText: {
    color: MonoColors.onInk,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  ctaSub: {
    color: MonoColors.onInk,
    fontSize: 12,
    marginTop: 6,
    opacity: 0.7,
  },
});
