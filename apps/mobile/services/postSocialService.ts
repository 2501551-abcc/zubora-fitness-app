/**
 * フレンド投稿（friend_posts）への「リアクション」「コメント」データ層
 * =====================================================================
 * reactions は既存テーブル（本番で手動作成済み・type=絵文字文字列）。
 * comments は新規追加。見られる相手は自分 or acceptedなフレンドの投稿のみ
 * （supabase/migration_13_friend_post_social.sql の RLS / RPC が保証）。
 *
 *   getPostSocial(postIds)      … 一覧画面用の集計（type別件数・自分の反応・コメント数）
 *   togglePostReaction(id, type) … 同じtype→取り消し、違うtype→追加（1人で複数種類OK）
 *   getPostComments(postId)     … 1件ぶんのコメント一覧
 *   addPostComment(id, body)
 *   deletePostComment(commentId)
 * =====================================================================
 */

import { supabase } from '@/supabase';
import { sendPushNotification } from '@/services/notificationService';
import type { PostCommentRow, PostSocialRow } from '@/types/db';

/** 複数投稿ぶんの集計をまとめて取得（1 post_id につき type の種類数ぶん行が返る） */
export async function getPostSocial(postIds: string[]): Promise<PostSocialRow[]> {
  if (postIds.length === 0) return [];
  const { data, error } = await supabase.rpc('get_post_social', { p_post_ids: postIds });
  if (error) throw error;
  return (data ?? []) as PostSocialRow[];
}

/** 画面で使いやすい形にグルーピング（post_id → type別件数・コメント数） */
export type PostSocialSummary = {
  reactions: { type: string; count: number; mine: boolean }[];
  commentCount: number;
};

export function groupPostSocial(rows: PostSocialRow[]): Record<string, PostSocialSummary> {
  const out: Record<string, PostSocialSummary> = {};
  for (const row of rows) {
    const entry = (out[row.post_id] ??= { reactions: [], commentCount: row.comment_count });
    if (row.reaction_type) {
      entry.reactions.push({ type: row.reaction_type, count: row.reaction_count, mine: row.my_reacted });
    }
  }
  return out;
}

/** 1件ぶんのコメント一覧（投稿者の名前・アバター付き、古い順） */
export async function getPostComments(postId: string): Promise<PostCommentRow[]> {
  const { data, error } = await supabase.rpc('get_post_comments', { p_post_id: postId });
  if (error) throw error;
  return (data ?? []) as PostCommentRow[];
}

/**
 * リアクションの切り替え。
 * 同じtypeを再度押すと取り消し、違うtypeを押すと追加（1人で複数種類OK）。
 * 新規に付いた場合のみ、投稿の本人へPush通知を送る。
 */
export async function togglePostReaction(
  postId: string,
  type: string,
): Promise<{ removed: boolean; type: string }> {
  const { data, error } = await supabase.rpc('toggle_post_reaction', {
    p_post_id: postId,
    p_type: type,
  });
  if (error) throw error;
  const row = (data ?? [])[0] as { removed: boolean; type: string } | undefined;
  const result = row ?? { removed: false, type };

  if (!result.removed) {
    void notifyPostOwner(postId, (myName) => ({
      title: 'リアクションがつきました 💪',
      body: `${myName}さんが${result.type}でリアクションしました`,
    }));
  }

  return result;
}

/** コメントを追加（投稿の本人へPush通知を送る） */
export async function addPostComment(postId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('add_post_comment', {
    p_post_id: postId,
    p_body: body,
  });
  if (error) throw error;

  void notifyPostOwner(postId, (myName) => ({
    title: 'コメントがつきました 💬',
    body: `${myName}さん: ${body.slice(0, 60)}`,
  }));
}

export async function deletePostComment(commentId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_post_comment', { p_comment_id: commentId });
  if (error) throw error;
}

/* ============================================================
 * Push通知（投稿の本人が自分以外のときだけ送る）
 * ========================================================== */

async function notifyPostOwner(
  postId: string,
  buildMessage: (myName: string) => { title: string; body: string },
): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const myUserId = auth.user?.id;
    if (!myUserId) return;

    const { data: post } = await supabase
      .from('friend_posts')
      .select('user_id')
      .eq('id', postId)
      .single();
    const ownerId = post?.user_id as string | undefined;
    if (!ownerId || ownerId === myUserId) return;

    const [{ data: myProfile }, { data: ownerProfile }] = await Promise.all([
      supabase.from('users').select('name').eq('id', myUserId).single(),
      supabase.from('users').select('push_token').eq('id', ownerId).single(),
    ]);

    const pushToken = ownerProfile?.push_token as string | undefined;
    if (!pushToken) return;

    const myName = myProfile?.name ?? '誰か';
    const { title, body } = buildMessage(myName);
    await sendPushNotification(pushToken, title, body);
  } catch (err) {
    console.error('[postSocialService] Push notification trigger error:', err);
  }
}

/* ============================================================
 * Realtime: 指定した投稿群への反応/コメントの変更を購読
 * ========================================================== */

async function removeChannelsByTopic(topic: string): Promise<void> {
  const realtimeTopic = `realtime:${topic}`;
  const stale = supabase.getChannels().filter((c) => c.topic === realtimeTopic);
  await Promise.all(stale.map((c) => supabase.removeChannel(c)));
}

/** 指定した投稿群への反応/コメントの変更を購読（一覧画面のバッジ即時更新用） */
export function subscribeToPostSocial(postIds: string[], onChange: () => void): () => void {
  if (postIds.length === 0) return () => {};
  const topic = `post-social-${postIds.slice().sort().join('-')}`;
  let disposed = false;

  const init = async () => {
    await removeChannelsByTopic(topic);
    if (disposed) return;

    const channel = supabase.channel(topic);
    if (String(channel.state) !== 'closed') return;

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => onChange())
      .subscribe();
  };

  void init();

  return () => {
    disposed = true;
    void removeChannelsByTopic(topic);
  };
}
