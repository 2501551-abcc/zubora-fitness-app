/**
 * 認証まわりのデータ層（Supabase Auth + public.users）
 * =====================================================================
 * 画面（app/auth.tsx, app/settings.tsx）はこの関数だけを呼びます。
 *   signUp / signIn / signOut / deleteAccount
 *   getAccountInfo / updateProfile / setAvatarEmoji / changeEmail / changePassword
 *   onAuthChange / getSession
 *
 * users 行は DB トリガー handle_new_user が自動作成します
 * （signUp の options.data に name 等を渡すだけ / supabase/schema.sql 参照）。
 * =====================================================================
 */

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import { supabase } from '@/supabase';
import type { AppUser, TimeString } from '@/types/db';

/**
 * 端末の電波状況などで fetch が固まったままにならないよう、認証系の通信に上限時間を設ける。
 * （固まると画面のローディングが戻らず「ボタンが効かない」ように見えるため）
 */
function withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error('通信がタイムアウトしました。電波・Wi-Fi を確認してもう一度お試しください。')),
        ms,
      ),
    ),
  ]);
}

/* ---------------- サインアップ ---------------- */

export type SignUpParams = {
  email: string;
  password: string;
  /** ニックネーム。users.name になる */
  name: string;
  /** 'HH:MM' 形式（通知の希望時間帯） */
  preferredTimeOfDay?: TimeString;
};

/**
 * 新規アカウント作成。
 * メール確認が有効な場合 `needsEmailConfirm = true`（確認リンクで確定）。
 */
export async function signUp(params: SignUpParams): Promise<{ needsEmailConfirm: boolean }> {
  const { data, error } = await withTimeout(
    supabase.auth.signUp({
      email: params.email.trim(),
      password: params.password,
      options: {
        data: {
          name: params.name.trim(),
          preferred_time_of_day: params.preferredTimeOfDay ?? '20:00',
        },
      },
    }),
  );
  if (error) throw error;
  return { needsEmailConfirm: !!data.user && !data.session };
}

/* ---------------- ログイン ---------------- */

export async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await withTimeout(
    supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    }),
  );
  if (error) throw error;
  return data.session;
}

/* ---------------- ログアウト ---------------- */

export async function signOut(): Promise<void> {
  try {
    await supabase.rpc('update_my_presence', { p_is_online: false });
  } catch {
    // オフライン等でも続行
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/* ---------------- プロフィール取得 / 更新 ---------------- */

export async function getMyProfile(): Promise<AppUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  return data as AppUser;
}

export type ProfileUpdate = Partial<
  Pick<
    AppUser,
    'name' | 'avatar_url' | 'avatar_emoji' | 'preferred_time_of_day' | 'notification_enabled'
  >
>;

/** auth のメタデータ等から表示名のフォールバックを決める（users 行を新規作成する場合用） */
function fallbackNameFromUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const meta = user.user_metadata ?? {};
  const fromMeta =
    (typeof meta.name === 'string' && meta.name.trim()) ||
    (typeof meta.username === 'string' && meta.username.trim()) ||
    '';
  if (fromMeta) return fromMeta;
  const fromEmail = user.email?.split('@')[0]?.trim();
  if (fromEmail) return fromEmail;
  return `user_${user.id.replace(/-/g, '').slice(0, 8)}`;
}

const isMissingColumn = (msg: string | undefined, col: string) =>
  !!msg && (msg.includes(col) || msg.includes('schema cache'));

/**
 * 設定画面からのプロフィール更新。
 * ・users テーブルを更新（`avatar_emoji` 列が無い旧スキーマでも壊れないよう自動リトライ）
 * ・行がまだ無ければ最小項目で作成
 * ・表示名／アイコンは user_metadata にもミラー（行取得前の表示フォールバック用）
 */
export async function updateProfile(patch: ProfileUpdate): Promise<AppUser> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('AUTH_REQUIRED');

  const runUpdate = (p: ProfileUpdate) =>
    supabase.from('users').update(p).eq('id', user.id).select('*');

  let res = await runUpdate(patch);
  if (res.error && isMissingColumn(res.error.message, 'avatar_emoji')) {
    const { avatar_emoji: _omit, ...rest } = patch;
    res =
      Object.keys(rest).length > 0
        ? await runUpdate(rest)
        : await supabase.from('users').select('*').eq('id', user.id);
  }
  if (res.error) throw res.error;

  let row = (res.data as AppUser[] | null)?.[0];

  // users 行がまだ無い（0件更新）なら作成してから読み直す
  if (!row) {
    const seed: Record<string, unknown> = {
      id: user.id,
      name: fallbackNameFromUser(user),
      ...patch,
    };
    let ins = await supabase.from('users').insert(seed);
    if (ins.error && isMissingColumn(ins.error.message, 'avatar_emoji')) {
      delete seed.avatar_emoji;
      ins = await supabase.from('users').insert(seed);
    }
    if (ins.error && !ins.error.message.includes('duplicate key')) throw ins.error;
    const back = await supabase.from('users').select('*').eq('id', user.id).single();
    row = back.data as AppUser;
  }

  const mirror: Record<string, unknown> = {};
  if (patch.name !== undefined) mirror.name = patch.name;
  if (patch.avatar_url !== undefined) mirror.avatar_url = patch.avatar_url;
  if (patch.avatar_emoji !== undefined) mirror.avatar_emoji = patch.avatar_emoji;
  if (Object.keys(mirror).length > 0) {
    await supabase.auth.updateUser({ data: mirror }).catch(() => undefined);
  }

  return row;
}

/* ---------------- 設定画面用のまとめ取得 / 更新 ---------------- */

export type AccountInfo = {
  userId: string;
  /** 認証情報 */
  email: string | null;
  /** メール確認が済んでいるか */
  emailConfirmed: boolean;
  /** プロフィール（フレンドから見える）: 表示名 = users.name */
  name: string;
  /** アバター絵文字。DB には持たず user_metadata に保存（表示の好み） */
  avatarEmoji: string;
  /** アバター画像URL（任意） */
  avatarUrl: string | null;
  /** 通知の希望時間帯 'HH:MM' */
  preferredTimeOfDay: string;
  /** 通知を受け取るか */
  notificationEnabled: boolean;
  /** フレンド申請に使う固有コード（例: ZBR-8A2K7X）。未取得なら '' */
  friendCode: string;
};

/**
 * 自分のフレンドコードを取得（無ければサーバー側で採番・保存）。
 * 未ログイン時は ''。
 */
export async function fetchMyFriendCode(): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('get_my_friend_code');
    if (error || typeof data !== 'string') return '';
    return data;
  } catch {
    return '';
  }
}

/** 設定画面の初期表示に必要な情報をまとめて取得 */
export async function getAccountInfo(): Promise<AccountInfo | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  let profile: Partial<AppUser> = {};
  try {
    // select('*') にして、旧スキーマで列が足りなくても壊れないようにする
    const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (data) profile = data as Partial<AppUser>;
  } catch {
    // users 行がまだ無い場合は metadata / 既定値で表示
  }

  // 行に friend_code が無い場合だけ RPC で採番（通常は 1 回のクエリで済む）
  const friendCode = profile.friend_code || (await fetchMyFriendCode());

  return {
    userId: user.id,
    email: user.email ?? null,
    emailConfirmed: !!user.email_confirmed_at || !!user.confirmed_at,
    name: (profile.name ?? (meta.name as string | undefined) ?? '').trim() || 'ゲスト',
    avatarEmoji:
      profile.avatar_emoji ?? (meta.avatar_emoji as string | undefined) ?? '✦',
    avatarUrl: profile.avatar_url ?? null,
    preferredTimeOfDay: toHm(profile.preferred_time_of_day ?? '20:00'),
    notificationEnabled: profile.notification_enabled ?? true,
    friendCode,
  };
}

/** アバター絵文字だけ更新（users テーブル ＋ user_metadata の両方） */
export async function setAvatarEmoji(emoji: string): Promise<void> {
  await updateProfile({ avatar_emoji: emoji });
}

/** メールアドレス変更（新旧アドレスに確認メールが飛び、確認後に確定） */
export async function changeEmail(newEmail: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
  if (error) throw error;
}

/** パスワード変更（ログイン中のみ） */
export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/** 'HH:MM:SS' や 'HH:MM' を 'HH:MM' に丸める */
function toHm(t: string): string {
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? `${m[1]}:${m[2]}` : '20:00';
}

/* ---------------- アカウント削除 ---------------- */

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_current_user');
  if (error) throw error;
  await supabase.auth.signOut();
}

/* ---------------- セッション監視ヘルパー ---------------- */

export function onAuthChange(
  cb: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(cb);
  return () => subscription.unsubscribe();
}

export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}
