/**
 * 継続ランキングのフレンドカードへの「ひと言コメント」データ層
 * =====================================================================
 * friend_posts向けcomments（postSocialService.ts）とは別物。対象は「投稿」
 * ではなく「フレンド本人」。見られる相手は本人 or acceptedなフレンド
 * （supabase/migration_14_friend_comments.sql の RLS / RPC が保証）。
 *
 *   getFriendCommentSummary(toUserIds) … 一覧画面用（件数＋最新1件）
 *   getFriendComments(toUserId)        … 1人ぶんの全文一覧（新しい順）
 *   addFriendComment(toUserId, body)   … 追加＋Push通知
 *   deleteFriendComment(commentId)
 * =====================================================================
 */

import { supabase } from '@/supabase';
import { sendPushNotification } from '@/services/notificationService';
import type {
  AddFriendCommentResult,
  FriendCommentRow,
  FriendCommentSummaryRow,
} from '@/types/db';

/** 複数フレンド分の件数＋最新1件をまとめて取得（ランキング一覧のプレビュー表示用） */
export async function getFriendCommentSummary(
  toUserIds: string[],
): Promise<FriendCommentSummaryRow[]> {
  if (toUserIds.length === 0) return [];
  const { data, error } = await supabase.rpc('get_friend_comment_summary', {
    p_to_user_ids: toUserIds,
  });
  if (error) throw error;
  return (data ?? []) as FriendCommentSummaryRow[];
}

/** 1人ぶんの全文一覧（新しい順） */
export async function getFriendComments(toUserId: string): Promise<FriendCommentRow[]> {
  const { data, error } = await supabase.rpc('get_friend_comments', {
    p_to_user_id: toUserId,
    p_limit: 30,
  });
  if (error) throw error;
  return (data ?? []) as FriendCommentRow[];
}

/** コメントを追加（フレンド限定・自分のカードへの自分からのコメントもOK）。送れたらPush通知も送る */
export async function addFriendComment(
  toUserId: string,
  body: string,
): Promise<AddFriendCommentResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > 200) return { ok: false, reason: 'too_long' };

  const { error } = await supabase.rpc('add_friend_comment', {
    p_to_user_id: toUserId,
    p_body: trimmed,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('NOT_FRIENDS')) return { ok: false, reason: 'not_friends' };
    if (msg.includes('BODY_TOO_LONG')) return { ok: false, reason: 'too_long' };
    if (msg.includes('BODY_REQUIRED')) return { ok: false, reason: 'empty' };
    return { ok: false, reason: 'unknown' };
  }

  void notifyCardOwner(toUserId, trimmed);
  return { ok: true };
}

export async function deleteFriendComment(commentId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_friend_comment', { p_comment_id: commentId });
  if (error) throw error;
}

async function notifyCardOwner(toUserId: string, body: string): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const myUserId = auth.user?.id;
    if (!myUserId || toUserId === myUserId) return;

    const [{ data: myProfile }, { data: ownerProfile }] = await Promise.all([
      supabase.from('users').select('name').eq('id', myUserId).single(),
      supabase.from('users').select('push_token').eq('id', toUserId).single(),
    ]);

    const pushToken = ownerProfile?.push_token as string | undefined;
    if (!pushToken) return;

    const myName = myProfile?.name ?? '誰か';
    await sendPushNotification(
      pushToken,
      'コメントが届きました 💬',
      `${myName}さん: ${body.slice(0, 60)}`,
    );
  } catch (err) {
    console.error('[friendCommentService] Push notification trigger error:', err);
  }
}
