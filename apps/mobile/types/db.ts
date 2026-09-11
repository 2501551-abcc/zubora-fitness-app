/**
 * Supabase の実テーブル / RPC に対応する型（supabase/schema.sql と一致）
 * 既存スキーマ: users / friendships(user_id_a,b) / workout_logs
 */

/** 'HH:MM:SS' 形式（Postgres time without time zone） */
export type TimeString = string;
export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

/** public.users */
export type AppUser = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  /** 画像未設定時のフォールバック絵文字（フレンドからも見える） */
  avatar_emoji: string;
  /** フレンド申請に使う固有コード（例: ZBR-8A2K7X） */
  friend_code: string | null;
  preferred_time_of_day: TimeString;
  notification_enabled: boolean;
  is_online: boolean;
  last_seen: string;
  created_at: string;
  updated_at: string;
};

/** public.friendships */
export type Friendship = {
  id: string;
  user_id_a: string; // 申請者
  user_id_b: string; // 相手
  status: FriendshipStatus;
  created_at: string;
  updated_at: string;
};

/** RPC: get_friends_with_status() の1行 */
export type FriendWithStatus = {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  avatar_emoji: string | null;
  is_online: boolean;
  last_seen: string;
  streak_days: number;
  /** 最終実施日からの経過日数。記録が無ければ null */
  rest_days: number | null;
  best_streak_days: number;
  friends_since: string;
};

/** RPC: get_incoming_friend_requests() の1行 */
export type IncomingRequestRow = {
  request_id: string;
  from_user_id: string;
  from_name: string | null;
  from_avatar_url: string | null;
  created_at: string;
};
