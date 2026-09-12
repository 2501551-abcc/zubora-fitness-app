/**
 * ホーム画面（タブの "/"）
 * -------------------------------------------------------------
 * アプリのハブ。「筋トレを始める」で準備画面へ、目標ロードマップへは
 * 「今週の目標」カードか下部の横並びメニューバー（ホーム / 目標 / フレンド / 設定）から。
 * モノトーン基調 ＋ 星のあしらいで認証画面とトーンを統一。
 */

import { Feather } from '@expo/vector-icons';
import type { User } from '@supabase/supabase-js';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MonoColors, MonoGlyph, MonoLayout } from '@/constants/mono-theme';
import { tapImpact, tapLight } from '@/lib/haptics';
import { fetchThisWeekFocus } from '@/services/goalService';
import { fetchFriends } from '@/services/friendsService';
import { fetchHomeStats } from '@/services/workoutService';
import type { Friend } from '@/types/friends';
import type { WeekFocus } from '@/types/goal';
import type { HomeStats } from '@/types/workout';
import { supabase } from '@/supabase';

const ZERO_STATS: HomeStats = { streakDays: 0, weekMinutes: 0, weekWorkouts: 0 };

export default function HomeScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<HomeStats>(ZERO_STATS);
  const [focus, setFocus] = useState<WeekFocus | null>(null);
  const [topFriend, setTopFriend] = useState<Friend | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (alive) setUser(session?.user ?? null);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setUser(session?.user ?? null);
    });

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // 画面に戻るたび最新の実績・今週の目標を取得。
  // 筋トレ保存（fire-and-forget の insert）直後は間に合わないことがあるので、
  // 少し置いてもう一度取り直す。
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const refresh = () => {
        fetchHomeStats().then((s) => {
          if (alive) setStats(s);
        });
        fetchThisWeekFocus().then((f) => {
          if (alive) setFocus(f);
        });
        // フレンドランキング1位（自分以外）を表示。フレンドが1人もいなければ非表示。
        fetchFriends()
          .then((list) => {
            if (!alive) return;
            const others = list.filter((f) => !f.is_self);
            const top =
              others.length > 0
                ? [...others].sort((a, b) => b.streak_days - a.streak_days)[0]
                : null;
            setTopFriend(top);
          })
          .catch(() => {
            if (alive) setTopFriend(null);
          });
      };
      refresh();
      const retries = [1500, 4000].map((ms) => setTimeout(refresh, ms));
      return () => {
        alive = false;
        retries.forEach(clearTimeout);
      };
    }, []),
  );

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
          <View style={styles.headerText}>
            <Text style={styles.hello}>
              {nickname ? `${nickname} さん` : 'ようこそ'}
            </Text>
            <Text style={styles.title}>今日も頑張ろう</Text>
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

        {/* 実績・今週の目標・ロードマップ導線を上寄せで配置 */}
        <View style={styles.middleGroup}>
          <View style={styles.stats}>
            <View style={styles.statCard}>
              <Text style={styles.statTop}>
                {MonoGlyph.star} 連続記録
              </Text>
              <Text style={styles.statValue}>
                {stats.streakDays}
                <Text style={styles.statUnit}> 日</Text>
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statTop}>{MonoGlyph.star} 今週の合計</Text>
              <Text style={styles.statValue}>
                {stats.weekMinutes}
                <Text style={styles.statUnit}> 分</Text>
              </Text>
            </View>
          </View>

          {/* 今週の目標（保存済みロードマップがあるときだけ表示） */}
          {focus && (
            <Pressable style={styles.focusCard} onPress={() => router.push('/goal')}>
              <View style={styles.focusHead}>
                <Text style={styles.focusLabel}>
                  {focus.isComplete ? MonoGlyph.sparkle + ' プラン達成' : `今週の目標・${focus.currentWeek}週目`}
                </Text>
                <Feather name="chevron-right" size={16} color={MonoColors.textMuted} />
              </View>
              <Text style={styles.focusTitle} numberOfLines={2}>
                {focus.isComplete
                  ? `「${focus.roadmapTitle}」やりきりました！`
                  : (focus.taskTitle ?? focus.roadmapTitle)}
              </Text>
              {!focus.isComplete && focus.frequencyPerWeek != null && focus.frequencyPerWeek > 0 && (
                <View style={styles.focusProgressWrap}>
                  <View style={styles.focusProgressTrack}>
                    <View
                      style={[
                        styles.focusProgressFill,
                        {
                          width: `${
                            Math.min(1, stats.weekWorkouts / focus.frequencyPerWeek) * 100
                          }%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.focusSub}>
                    週{focus.frequencyPerWeek}回中{Math.min(stats.weekWorkouts, focus.frequencyPerWeek)}回済み
                  </Text>
                </View>
              )}
            </Pressable>
          )}

          {/* フレンドランキング1位（フレンドが1人もいなければ非表示） */}
          {topFriend && (
            <Pressable style={styles.friendCard} onPress={() => router.push('/friends')}>
              <View style={styles.friendCardHead}>
                <Text style={styles.friendCardLabel}>
                  {MonoGlyph.star} フレンドランキング1位
                </Text>
                <Feather name="chevron-right" size={16} color={MonoColors.textMuted} />
              </View>
              <View style={styles.friendCardBody}>
                <View style={styles.friendAvatar}>
                  <Text style={styles.friendAvatarEmoji}>{topFriend.avatar_emoji}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.friendName} numberOfLines={1}>
                    {topFriend.username}
                  </Text>
                  <Text style={styles.friendMeta}>
                    🔥{topFriend.streak_days}日連続・今週{topFriend.week_minutes}分
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
        </View>

        {/* メインCTA（画面下に固定。下のメニューバーとの間隔を30に） */}
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
  middleGroup: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: 10,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
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
    paddingVertical: 24,
    paddingHorizontal: 18,
  },
  statTop: {
    fontSize: 13,
    fontWeight: '600',
    color: MonoColors.textSecondary,
    marginBottom: 10,
  },
  statValue: { fontSize: 34, fontWeight: '800', color: MonoColors.ink },
  statUnit: { fontSize: 15, fontWeight: '400', color: MonoColors.textSecondary },

  focusCard: {
    backgroundColor: MonoColors.surface,
    borderWidth: 1,
    borderColor: MonoColors.border,
    borderRadius: MonoLayout.radiusCard,
    padding: 20,
  },
  focusHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  focusLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: MonoColors.successSoft,
    letterSpacing: 0.5,
  },
  focusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: MonoColors.ink,
    marginTop: 8,
  },
  focusSub: {
    fontSize: 13,
    color: MonoColors.textSecondary,
  },
  focusProgressWrap: {
    marginTop: 10,
    gap: 6,
  },
  focusProgressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: MonoColors.border,
    overflow: 'hidden',
  },
  focusProgressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: MonoColors.successSoft,
  },

  friendCard: {
    backgroundColor: MonoColors.surface,
    borderWidth: 1,
    borderColor: MonoColors.border,
    borderRadius: MonoLayout.radiusCard,
    padding: 20,
  },
  friendCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  friendCardLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: MonoColors.accent,
    letterSpacing: 0.5,
  },
  friendCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: MonoLayout.radiusPill,
    backgroundColor: MonoColors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarEmoji: { fontSize: 20 },
  friendName: { fontSize: 15, fontWeight: '700', color: MonoColors.ink },
  friendMeta: { fontSize: 13, color: MonoColors.textSecondary, marginTop: 2 },

  cta: {
    backgroundColor: MonoColors.ink,
    borderRadius: MonoLayout.radiusCard,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 30,
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
