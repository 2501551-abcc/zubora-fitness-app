/**
 * フレンド一覧ダッシュボード（"/friends"）
 * -------------------------------------------------------------
 * ・オンライン状況（Supabase Realtime Presence）
 * ・継続日数ランキング ＋ サボり具合をポップに可視化
 * ・フレンド申請の送信（ID指定）／届いた申請の承認・拒否
 *
 * モノトーン基調 ＋ 大人カワイイ（枠線のあしらい・連続達成の星）。
 * グラフ類は追加ライブラリ不要で動くよう Reanimated + View で実装。
 * アイコンは同梱の @expo/vector-icons（Feather）。
 */

import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MonoColors, MonoGlyph, MonoLayout } from '@/constants/mono-theme';
import { useAuthSession } from '@/hooks/use-auth-session';
import { notifySuccess, tapImpact, tapLight } from '@/lib/haptics';
import {
  acceptFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  rejectFriendRequest,
  sendFriendRequest,
  subscribeToFriendRequests,
  subscribeToPresence,
} from '@/services/friendsService';
import type { Friend, FriendRequest, OnlineMap } from '@/types/friends';

/** オンライン枠の発光カラー（ピンク／ゴールド） */
const GLOW_PINK = '#E4A7B7';
const GLOW_GOLD = '#D8B45C';
/** この日数ごとに星をひとつ灯す */
const STAR_PER_DAYS = 7;

export default function FriendsScreen() {
  const router = useRouter();
  const { session, loading } = useAuthSession();

  // 初回のセッション確認中
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={MonoColors.ink} />
      </SafeAreaView>
    );
  }

  // 未ログイン：フレンド系 RPC は authenticated 限定なのでログイン導線を表示
  if (!session) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable hitSlop={10} onPress={() => router.back()}>
            <Feather name="chevron-left" size={24} color={MonoColors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>フレンド</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.gate}>
          <Text style={styles.gateGlyph}>{MonoGlyph.ribbon}</Text>
          <Text style={styles.gateTitle}>ログインが必要です</Text>
          <Text style={styles.gateSub}>
            フレンドの継続状況やフレンド申請は{'\n'}ログインすると見られます
          </Text>
          <Pressable
            style={styles.gateBtn}
            onPress={() => {
              tapLight();
              router.push('/auth');
            }}>
            <Feather name="star" size={15} color={MonoColors.onInk} />
            <Text style={styles.gateBtnText}>ログイン / 新規登録</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return <FriendsDashboard />;
}

function FriendsDashboard() {
  const router = useRouter();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [online, setOnline] = useState<OnlineMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([fetchFriends(), fetchFriendRequests()]);
      setFriends(f);
      setRequests(r);
    } catch (e) {
      console.warn('[friends] 一覧の取得に失敗しました', e);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await load();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [load]);

  // Realtime Presence（オンライン状況）
  useEffect(() => subscribeToPresence(setOnline), []);

  // 新しいフレンド申請の到着を購読
  useEffect(
    () =>
      subscribeToFriendRequests(() => {
        void fetchFriendRequests().then(setRequests);
      }),
    [],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleAccept = async (req: FriendRequest) => {
    tapImpact();
    setRequests((prev) => prev.filter((r) => r.request_id !== req.request_id));
    try {
      await acceptFriendRequest(req.request_id);
      notifySuccess();
    } catch (e) {
      console.warn('[friends] 承認に失敗しました', e);
    }
    await load();
  };

  const handleReject = async (req: FriendRequest) => {
    tapLight();
    setRequests((prev) => prev.filter((r) => r.request_id !== req.request_id));
    try {
      await rejectFriendRequest(req.request_id);
    } catch (e) {
      console.warn('[friends] 拒否に失敗しました', e);
    }
  };

  const ranked = useMemo(
    () => [...friends].sort((a, b) => b.streak_days - a.streak_days),
    [friends],
  );
  const onlineCount = ranked.filter((f) => online[f.user_id]).length;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={MonoColors.ink} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Feather name="chevron-left" size={24} color={MonoColors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>フレンド</Text>
        <Pressable
          hitSlop={10}
          onPress={() => {
            tapLight();
            setAddOpen(true);
          }}>
          <Feather name="user-plus" size={22} color={MonoColors.ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={MonoColors.textMuted}
          />
        }>
        <Text style={styles.summaryLine}>
          {MonoGlyph.sparkle} いま {onlineCount} 人がオンライン・
          {ranked.length} 人と励まし合い中
        </Text>

        {/* 届いているフレンド申請 */}
        {requests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              フレンド申請 <Text style={styles.countPill}>{requests.length}</Text>
            </Text>
            <View style={styles.card}>
              {requests.map((req, i) => (
                <View key={req.request_id}>
                  {i > 0 && <View style={styles.hair} />}
                  <RequestRow
                    req={req}
                    onAccept={() => handleAccept(req)}
                    onReject={() => handleReject(req)}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ランキング */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>継続ランキング</Text>
          <View style={{ gap: 12 }}>
            {ranked.map((friend, i) => (
              <FriendCard
                key={friend.user_id}
                friend={friend}
                rank={i + 1}
                online={online[friend.user_id]}
              />
            ))}
          </View>
        </View>

        <Text style={styles.footNote}>
          {MonoGlyph.star} むりせず、ゆるく、いっしょに
        </Text>
      </ScrollView>

      <AddFriendModal visible={addOpen} onClose={() => setAddOpen(false)} />
    </SafeAreaView>
  );
}

/* ============================================================
 * フレンドカード
 * ========================================================== */

function FriendCard({
  friend,
  rank,
  online,
}: {
  friend: Friend;
  rank: number;
  online?: { last_active_at: string };
}) {
  const isOnline = !!online;
  const lastActive = online?.last_active_at ?? friend.last_active_at;
  const stars = Math.min(5, Math.floor(friend.streak_days / STAR_PER_DAYS));
  const goal = Math.max(friend.best_streak_days, STAR_PER_DAYS);
  const progress = Math.min(1, friend.streak_days / goal);

  return (
    <View style={[styles.friendCard, rank === 1 && styles.friendCardTop]}>
      {/* ランク */}
      <View style={[styles.rankBadge, rank === 1 && styles.rankBadgeTop]}>
        {rank === 1 ? (
          <Text style={styles.rankStar}>{MonoGlyph.star}</Text>
        ) : (
          <Text style={styles.rankNum}>{rank}</Text>
        )}
      </View>

      {/* アバター＋オンライン発光 */}
      <Avatar
        uri={friend.avatar_url}
        emoji={friend.avatar_emoji}
        online={isOnline}
      />

      {/* 本文 */}
      <View style={styles.friendBody}>
        <View style={styles.nameRow}>
          <Text style={styles.friendName} numberOfLines={1}>
            {friend.username}
          </Text>
          {isOnline ? (
            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Online</Text>
            </View>
          ) : (
            <Text style={styles.lastActive}>{formatRelative(lastActive)}</Text>
          )}
        </View>

        {/* 継続 / サボり */}
        <Text style={styles.streakLine}>
          {friend.streak_days > 0 ? (
            <>
              <Text style={styles.streakNum}>🔥{friend.streak_days}</Text>
              <Text style={styles.streakUnit}>日連続！</Text>
            </>
          ) : (
            <Text style={styles.restText}>{restMessage(friend.rest_days)}</Text>
          )}
        </Text>

        {friend.streak_days > 0 && stars > 0 && (
          <Text style={styles.starRow}>
            {'★'.repeat(stars)}
            <Text style={styles.starMuted}>{'☆'.repeat(5 - stars)}</Text>
          </Text>
        )}

        <StreakBar progress={progress} highlight={rank === 1} />
        <Text style={styles.barCaption}>
          {friend.streak_days > 0
            ? `自己ベスト ${friend.best_streak_days}日まで あと ${Math.max(
                0,
                friend.best_streak_days - friend.streak_days,
              )}日`
            : restMessage(friend.rest_days)}
        </Text>
      </View>
    </View>
  );
}

/* ============================================================
 * アバター（オンライン時はピンク/ゴールドに発光）
 * ========================================================== */

function Avatar({
  uri,
  emoji,
  online,
  size = 52,
}: {
  uri: string | null;
  emoji: string;
  online: boolean;
  size?: number;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (online) {
      pulse.value = withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [online, pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + (1 - pulse.value) * 0.5,
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));

  return (
    <View style={{ width: size + 12, height: size + 12, alignItems: 'center', justifyContent: 'center' }}>
      {online && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowRing,
            { width: size + 12, height: size + 12, borderRadius: (size + 12) / 2 },
            glowStyle,
          ]}
        />
      )}
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2 },
          online && styles.avatarOnline,
        ]}>
        {uri ? (
          <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        ) : (
          <Text style={{ fontSize: size * 0.42 }}>{emoji}</Text>
        )}
      </View>
    </View>
  );
}

/* ============================================================
 * 継続プログレスバー（Reanimated）
 * ========================================================== */

function StreakBar({
  progress,
  highlight,
}: {
  progress: number;
  highlight?: boolean;
}) {
  const w = useSharedValue(0);

  useEffect(() => {
    w.value = withTiming(progress, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [progress, w]);

  const fillStyle = useAnimatedStyle(() => ({ flex: Math.max(0.001, w.value) }));
  const restStyle = useAnimatedStyle(() => ({ flex: Math.max(0.001, 1 - w.value) }));

  return (
    <View style={styles.barTrack}>
      <Animated.View
        style={[styles.barFill, highlight && styles.barFillTop, fillStyle]}
      />
      <Animated.View style={restStyle} />
    </View>
  );
}

/* ============================================================
 * 申請の行
 * ========================================================== */

function RequestRow({
  req,
  onAccept,
  onReject,
}: {
  req: FriendRequest;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <View style={styles.reqRow}>
      <Avatar uri={req.from_avatar_url} emoji={req.from_avatar_emoji} online={false} size={40} />
      <View style={styles.reqBody}>
        <Text style={styles.reqName}>{req.from_username}</Text>
        <Text style={styles.reqMeta}>{formatRelative(req.created_at)}・フレンド申請</Text>
      </View>
      <Pressable style={[styles.reqBtn, styles.reqReject]} onPress={onReject} hitSlop={6}>
        <Feather name="x" size={16} color={MonoColors.textSecondary} />
      </Pressable>
      <Pressable style={[styles.reqBtn, styles.reqAccept]} onPress={onAccept} hitSlop={6}>
        <Feather name="check" size={16} color={MonoColors.onInk} />
      </Pressable>
    </View>
  );
}

/* ============================================================
 * フレンド追加モーダル
 * ========================================================== */

function AddFriendModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [id, setId] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const close = () => {
    setId('');
    setResult(null);
    onClose();
  };

  const submit = async () => {
    if (!id.trim() || sending) return;
    tapImpact();
    setSending(true);
    setResult(null);
    const res = await sendFriendRequest(id);
    setSending(false);
    if (res.ok) {
      notifySuccess();
      setResult('申請を送りました ✨');
      setId('');
    } else {
      setResult(REASON_TEXT[res.reason]);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>フレンドを追加 {MonoGlyph.ribbon}</Text>
          <Text style={styles.sheetSub}>相手のユーザーIDを入力して申請します</Text>

          <View style={styles.searchRow}>
            <Feather name="search" size={18} color={MonoColors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="例）ユーザーID / ニックネーム"
              placeholderTextColor={MonoColors.textMuted}
              value={id}
              onChangeText={setId}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={submit}
              returnKeyType="send"
            />
          </View>

          {result && <Text style={styles.resultText}>{result}</Text>}

          <Pressable
            style={[styles.sendBtn, (sending || !id.trim()) && styles.sendBtnDisabled]}
            onPress={submit}
            disabled={sending || !id.trim()}>
            {sending ? (
              <ActivityIndicator color={MonoColors.onInk} size="small" />
            ) : (
              <>
                <Feather name="send" size={15} color={MonoColors.onInk} />
                <Text style={styles.sendBtnText}>申請を送る</Text>
              </>
            )}
          </Pressable>

          <Pressable onPress={close} hitSlop={8} style={styles.cancelLink}>
            <Text style={styles.cancelLinkText}>閉じる</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ============================================================
 * ヘルパー
 * ========================================================== */

const REASON_TEXT: Record<string, string> = {
  not_found: 'そのIDのユーザーが見つかりませんでした',
  already_friend: 'すでにフレンドです ✨',
  already_requested: 'すでに申請済みです',
  self: '自分には申請できません',
  unknown: 'うまくいきませんでした。もう一度お試しください',
};

function restMessage(days: number): string {
  if (days <= 0) return '今日はもう動いた！えらい ✨';
  if (days === 1) return '1日おやすみ中 ☁️';
  if (days <= 3) return `${days}日おやすみ中 🌱 そろそろ戻ろっか`;
  return `${days}日ぶり、いっしょに再スタートしよ 🍰`;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  return `${day}日前`;
}

/* ============================================================
 * スタイル
 * ========================================================== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MonoColors.screenBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: MonoLayout.screenPadding, paddingBottom: 48 },

  /* 未ログイン時のゲート */
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: MonoLayout.screenPadding,
    paddingBottom: 64,
  },
  gateGlyph: { fontSize: 28, color: MonoColors.textMuted, marginBottom: 16 },
  gateTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
    color: MonoColors.ink,
  },
  gateSub: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: MonoColors.textSecondary,
  },
  gateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 28,
    paddingHorizontal: 24,
    height: 52,
    backgroundColor: MonoColors.ink,
    borderRadius: MonoLayout.radiusControl,
  },
  gateBtnText: {
    color: MonoColors.onInk,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },

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

  summaryLine: {
    fontSize: 12,
    color: MonoColors.textSecondary,
    marginTop: 4,
    marginBottom: 20,
  },

  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: MonoColors.textSecondary,
    marginBottom: 12,
    marginLeft: 4,
  },
  countPill: {
    color: MonoColors.accent,
    fontWeight: '700',
  },

  card: {
    backgroundColor: MonoColors.surface,
    borderRadius: MonoLayout.radiusCard,
    borderWidth: 1,
    borderColor: MonoColors.border,
    paddingHorizontal: 14,
  },
  hair: { height: 1, backgroundColor: MonoColors.border, marginLeft: 52 },

  /* フレンドカード */
  friendCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: MonoColors.surface,
    borderRadius: MonoLayout.radiusCard,
    borderWidth: 1,
    borderColor: MonoColors.border,
    padding: 14,
  },
  friendCardTop: {
    borderColor: MonoColors.ink,
  },
  rankBadge: {
    position: 'absolute',
    top: -8,
    left: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: MonoColors.surface,
    borderWidth: 1,
    borderColor: MonoColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  rankBadgeTop: {
    backgroundColor: MonoColors.ink,
    borderColor: MonoColors.ink,
  },
  rankNum: { fontSize: 11, fontWeight: '700', color: MonoColors.textSecondary },
  rankStar: { fontSize: 11, color: MonoColors.onInk },

  friendBody: { flex: 1, gap: 4 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  friendName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: MonoColors.ink,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: MonoColors.accentTint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: MonoLayout.radiusPill,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3Fae7f',
  },
  onlineText: {
    fontSize: 10,
    fontWeight: '700',
    color: MonoColors.accent,
    letterSpacing: 0.5,
  },
  lastActive: { fontSize: 11, color: MonoColors.textMuted },

  streakLine: { marginTop: 2 },
  streakNum: { fontSize: 15, fontWeight: '800', color: MonoColors.ink },
  streakUnit: { fontSize: 12, fontWeight: '600', color: MonoColors.inkSoft },
  restText: { fontSize: 12, fontWeight: '600', color: MonoColors.textSecondary },

  starRow: { fontSize: 11, color: MonoColors.accent, letterSpacing: 2 },
  starMuted: { color: MonoColors.border },

  barTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    backgroundColor: MonoColors.surfaceAlt,
    overflow: 'hidden',
    marginTop: 6,
  },
  barFill: {
    backgroundColor: MonoColors.inkSoft,
    borderRadius: 3,
  },
  barFillTop: { backgroundColor: GLOW_GOLD },
  barCaption: { fontSize: 10, color: MonoColors.textMuted, marginTop: 4 },

  /* アバター */
  glowRing: {
    position: 'absolute',
    borderWidth: 2.5,
    borderColor: GLOW_PINK,
    shadowColor: GLOW_GOLD,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MonoColors.surfaceAlt,
    borderWidth: 1,
    borderColor: MonoColors.border,
  },
  avatarOnline: { borderColor: GLOW_PINK },

  /* 申請行 */
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  reqBody: { flex: 1 },
  reqName: { fontSize: 14, fontWeight: '700', color: MonoColors.ink },
  reqMeta: { fontSize: 11, color: MonoColors.textMuted, marginTop: 2 },
  reqBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reqReject: { borderWidth: 1, borderColor: MonoColors.border, backgroundColor: MonoColors.surface },
  reqAccept: { backgroundColor: MonoColors.ink },

  footNote: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
    letterSpacing: 1,
    color: MonoColors.textMuted,
  },

  /* モーダル */
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,26,26,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: MonoColors.screenBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: MonoColors.border,
    marginBottom: 20,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: MonoColors.ink },
  sheetSub: {
    fontSize: 12,
    color: MonoColors.textSecondary,
    marginTop: 6,
    marginBottom: 20,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    backgroundColor: MonoColors.surface,
    borderWidth: 1,
    borderColor: MonoColors.border,
    borderRadius: MonoLayout.radiusControl,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  searchInput: { flex: 1, fontSize: 15, color: MonoColors.ink, paddingVertical: 12 },
  resultText: {
    alignSelf: 'flex-start',
    marginTop: 12,
    fontSize: 12,
    fontWeight: '600',
    color: MonoColors.inkSoft,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    backgroundColor: MonoColors.ink,
    borderRadius: MonoLayout.radiusControl,
    height: 52,
    marginTop: 20,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: MonoColors.onInk, fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  cancelLink: { marginTop: 14 },
  cancelLinkText: { fontSize: 13, color: MonoColors.textSecondary, fontWeight: '600' },
});
