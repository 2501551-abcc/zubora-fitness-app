/**
 * フレンド機能のデータ層（Supabase DB / RPC / Realtime）
 * =====================================================================
 * 画面（app/friends.tsx）はこのファイルの関数だけを呼びます。
 *
 * 正式API:
 *   getFriendsWithWorkoutStatus() … フレンド一覧＋継続/お休み状況
 *   getIncomingFriendRequests()   … 自分宛の申請一覧
 *   sendFriendRequest(username)   … 申請
 *   acceptFriendRequest(id) / rejectFriendRequest(id)
 *   subscribeToPresence(cb)       … オンライン状況（Realtime Presence）
 *   subscribeToFriendRequests(cb) … 申請の到着（postgres_changes）
 *
 * 互換のため fetchFriends / fetchFriendRequests も残しています
 * （UI 型 @/types/friends に変換して返す）。
 * =====================================================================
 */

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/supabase';
import { sendPushNotification } from '@/services/notificationService';

/**
 * 同じ topic の残存チャンネルを掃除する。
 * supabase.channel(topic) は同名 topic が登録済みだと「既存の（購読済みかもしれない）
 * チャンネル」を返すため、React StrictMode / Fast Refresh / 画面の再訪で
 * `cannot add callbacks ... after subscribe()` が起きる。作成前に必ず呼ぶ。
 */
async function removeChannelsByTopic(topic: string): Promise<void> {
  const realtimeTopic = `realtime:${topic}`;
  const stale = supabase.getChannels().filter((c) => c.topic === realtimeTopic);
  await Promise.all(stale.map((c) => supabase.removeChannel(c)));
}
import type {
  Friend,
  FriendRequest,
  OnlineMap,
  SendRequestResult,
} from '@/types/friends';
import type { FriendWithStatus, IncomingRequestRow } from '@/types/db';

/* ============================================================
 * 一覧取得
 * ========================================================== */

/** フレンド一覧＋継続日数・お休み日数（継続日数の多い順） */
export async function getFriendsWithWorkoutStatus(): Promise<FriendWithStatus[]> {
  const { data, error } = await supabase.rpc('get_friends_with_status');
  if (error) throw error;
  return (data ?? []) as FriendWithStatus[];
}

/** 自分宛の未応答フレンド申請 */
export async function getIncomingFriendRequests(): Promise<IncomingRequestRow[]> {
  const { data, error } = await supabase.rpc('get_incoming_friend_requests');
  if (error) throw error;
  return (data ?? []) as IncomingRequestRow[];
}

/* ============================================================
 * 申請・承認・拒否
 * ========================================================== */

/** フレンドコードを指定してフレンド申請を送る（ハイフン・大小文字は無視される） */
/*export async function sendFriendRequest(friendCode: string): Promise<SendRequestResult> {
  const { error } = await supabase.rpc('send_friend_request', {
    friend_code: friendCode.trim(),
  });
  if (!error) return { ok: true };

  const msg = error.message ?? '';
  if (msg.includes('USER_NOT_FOUND')) return { ok: false, reason: 'not_found' };
  if (msg.includes('ALREADY_FRIENDS')) return { ok: false, reason: 'already_friend' };
  if (msg.includes('ALREADY_REQUESTED')) return { ok: false, reason: 'already_requested' };
  if (msg.includes('CANNOT_ADD_SELF')) return { ok: false, reason: 'self' };
  return { ok: false, reason: 'unknown' };
}
*/

/** フレンドコードを指定してフレンド申請を送る（通知送信付き） */
export async function sendFriendRequest(friendCode: string): Promise<SendRequestResult> {
  const { error } = await supabase.rpc('send_friend_request', {
    friend_code: friendCode.trim(),
  });
  
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('USER_NOT_FOUND')) return { ok: false, reason: 'not_found' };
    if (msg.includes('ALREADY_FRIENDS')) return { ok: false, reason: 'already_friend' };
    if (msg.includes('ALREADY_REQUESTED')) return { ok: false, reason: 'already_requested' };
    if (msg.includes('CANNOT_ADD_SELF')) return { ok: false, reason: 'self' };
    return { ok: false, reason: 'unknown' };
  }

  // --- Push通知処理 ---
  try {
    const { data: auth } = await supabase.auth.getUser();
    const myUserId = auth.user?.id;

    // 自分のユーザー名を取得
    let myName = '誰か';
    if (myUserId) {
      const { data: myProfile } = await supabase
        .from('users')
        .select('name')
        .eq('id', myUserId)
        .single();
      if (myProfile?.name) myName = myProfile.name;
    }

    // 相手の push_token をフレンドコードから取得
    const formattedCode = friendCode.trim().toUpperCase();
    const { data: targetUser } = await supabase
      .from('users')
      .select('push_token')
      .eq('friend_code', formattedCode)
      .single();

    // トークンがあれば Push 通知を送信
    if (targetUser?.push_token) {
      await sendPushNotification(
        targetUser.push_token,
        'フレンド申請が届きました 🤝',
        `${myName}さんからフレンド申請が届いています。`,
      );
    }
  } catch (err) {
    console.error('Push notification trigger error:', err);
  }

  return { ok: true };
}

export async function acceptFriendRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('respond_to_friend_request', {
    p_request_id: requestId,
    p_accept: true,
  });
  if (error) throw error;
}

export async function rejectFriendRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('respond_to_friend_request', {
    p_request_id: requestId,
    p_accept: false,
  });
  if (error) throw error;
}

/** フレンド解除（friendships 行を削除。RLS で当事者のみ可） */
export async function removeFriend(friendUserId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new Error('AUTH_REQUIRED');
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(
      `and(user_id_a.eq.${me},user_id_b.eq.${friendUserId}),` +
        `and(user_id_a.eq.${friendUserId},user_id_b.eq.${me})`,
    );
  if (error) throw error;
}

/* ============================================================
 * Realtime: オンライン状況（Presence）
 * ========================================================== */

/**
 * Supabase Presence でフレンドのオンライン状況を購読。
 *
 *   useEffect(() => subscribeToPresence(setOnline), []);
 *
 * ・自分の在席を track() し、全員の presence state を OnlineMap で通知
 * ・購読開始/終了時に profiles.is_online も更新（postgres_changes 側の
 *   フォールバック用）
 */
const PRESENCE_TOPIC = 'online-users';

export function subscribeToPresence(onChange: (online: OnlineMap) => void): () => void {
  let channel: RealtimeChannel | null = null;
  let disposed = false;

  const init = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (disposed) return;

    // 前回の残存チャンネルを掃除してからでないと、既存の購読済みチャンネルが返り
    // .on() が "after subscribe()" で落ちる
    await removeChannelsByTopic(PRESENCE_TOPIC);
    if (disposed) return;

    const key = auth.user?.id ?? `anon-${Math.random().toString(36).slice(2)}`;
    const newChannel = supabase.channel(PRESENCE_TOPIC, {
      config: { presence: { key } },
    });

    // 掃除後でも別 init が先に購読していたら（並行実行）触らずに抜ける
    if (String(newChannel.state) !== 'closed') return;
    channel = newChannel;

    const emit = () => {
      const state = newChannel.presenceState<{ last_active_at?: string }>();
      const map: OnlineMap = {};
      for (const [userId, metas] of Object.entries(state)) {
        map[userId] = {
          last_active_at: metas[0]?.last_active_at ?? new Date().toISOString(),
        };
      }
      onChange(map);
    };

    newChannel
      .on('presence', { event: 'sync' }, emit)
      .on('presence', { event: 'join' }, emit)
      .on('presence', { event: 'leave' }, emit)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void newChannel.track({ last_active_at: new Date().toISOString() });
          void supabase.rpc('update_my_presence', { p_is_online: true });
        }
      });
  };

  void init();

  return () => {
    disposed = true;
    void supabase.rpc('update_my_presence', { p_is_online: false });
    channel = null;
    void removeChannelsByTopic(PRESENCE_TOPIC);
  };
}

/* ============================================================
 * Realtime: フレンド申請の到着 / フレンドのオンライン切替
 * ========================================================== */

/** friendships への変更（自分宛の申請など）を購読 */
export function subscribeToFriendRequests(onChange: () => void): () => void {
  let disposed = false;
  let topic: string | null = null;

  const init = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (disposed || !auth.user) return;

    topic = `friendship-changes-${auth.user.id}`;
    await removeChannelsByTopic(topic);
    if (disposed) return;

    const newChannel = supabase.channel(topic);
    if (String(newChannel.state) !== 'closed') return;

    newChannel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
          filter: `user_id_b=eq.${auth.user.id}`,
        },
        () => onChange(),
      )
      .subscribe();
  };

  void init();

  return () => {
    disposed = true;
    if (topic) void removeChannelsByTopic(topic);
  };
}

/**
 * フレンドの is_online 変化を購読（Presence を使わない/取りこぼし対策の
 * 代替手段）。RLS により自分が見られる profiles 行の変更のみ届く。
 */
export function subscribeToFriendPresenceRows(
  onChange: (userId: string, isOnline: boolean, lastSeen: string) => void,
): () => void {
  const TOPIC = 'friend-presence-rows';
  let disposed = false;

  const init = async () => {
    await removeChannelsByTopic(TOPIC);
    if (disposed) return;

    const channel = supabase.channel(TOPIC);
    if (String(channel.state) !== 'closed') return;

    channel
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        (payload) => {
          const row = payload.new as { id: string; is_online: boolean; last_seen: string };
          onChange(row.id, row.is_online, row.last_seen);
        },
      )
      .subscribe();
  };

  void init();

  return () => {
    disposed = true;
    void removeChannelsByTopic(TOPIC);
  };
}

/* ============================================================
 * 互換レイヤー（既存 app/friends.tsx 用。UI 型へ変換して返す）
 * ========================================================== */

const FALLBACK_EMOJI = ['✦', '✨', '🎀', '🤍', '🌙', '⭐️', '☕️', '🕊️'];

function fallbackEmoji(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACK_EMOJI[h % FALLBACK_EMOJI.length];
}

export async function fetchFriends(): Promise<Friend[]> {
  const rows = await getFriendsWithWorkoutStatus();
  return rows.map((r) => ({
    user_id: r.user_id,
    username: r.name ?? 'ゲスト',
    avatar_url: r.avatar_url,
    avatar_emoji: r.avatar_emoji ?? fallbackEmoji(r.user_id),
    streak_days: r.streak_days,
    rest_days: r.rest_days, // null = まだ記録なし
    last_active_at: r.last_seen,
    best_streak_days: Math.max(r.best_streak_days, r.streak_days, 7),
    week_minutes: r.week_minutes ?? 0,
    is_self: r.is_self,
  }));
}

export async function fetchFriendRequests(): Promise<FriendRequest[]> {
  const rows = await getIncomingFriendRequests();
  return rows.map((r) => ({
    request_id: r.request_id,
    from_user_id: r.from_user_id,
    from_username: r.from_name ?? 'ゲスト',
    from_avatar_url: r.from_avatar_url,
    from_avatar_emoji: fallbackEmoji(r.from_user_id),
    created_at: r.created_at,
  }));
}
