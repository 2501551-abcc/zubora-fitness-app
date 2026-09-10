/**
 * フレンド機能の型定義
 * -------------------------------------------------------------
 * UI（app/friends.tsx）とデータ層（services/friendsService.ts）で共有。
 */

/** フレンド1人ぶんの表示データ */
export type Friend = {
  user_id: string;
  username: string;
  /** アイコン画像URL。未設定なら null（頭文字＋絵文字で代替表示） */
  avatar_url: string | null;
  /** アバター絵文字（画像がないとき用）。例: '✦' '🎀' */
  avatar_emoji: string;
  /** 連続達成日数 */
  streak_days: number;
  /** 直近で運動した日からの経過日数（0 = 今日やった） */
  rest_days: number;
  /** 最終アクティブ日時（ISO文字列）。Presenceで上書きされる */
  last_active_at: string;
  /** 自己ベストの連続日数（プログレスバーの目盛りに使用） */
  best_streak_days: number;
};

/** 届いているフレンド申請 */
export type FriendRequest = {
  request_id: string;
  from_user_id: string;
  from_username: string;
  from_avatar_url: string | null;
  from_avatar_emoji: string;
  created_at: string;
};

/** 申請送信の結果 */
export type SendRequestResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'already_friend' | 'already_requested' | 'self' | 'unknown' };

/** Presenceで「オンライン」と判定されたユーザーIDの集合 */
export type OnlineMap = Record<string, { last_active_at: string }>;
