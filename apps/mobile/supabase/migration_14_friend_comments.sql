-- =====================================================================
--  マイグレーション #14 — 継続ランキングのフレンドカードへの「ひと言コメント」
-- ---------------------------------------------------------------------
--  friend_posts向けcomments（migration_13）とは別物。
--  対象は「投稿」ではなく「フレンド本人（のランキングカード）」。
--  friend_nudges（絵文字のみ・1日1回）の文章版だが、こちらは回数制限なし。
--
--  見られる相手は can_view_user_posts(to_user_id) と同じ
--  「card本人 or acceptedなフレンド」= そのカードを見られる人なら誰でも読める。
--
--  追加テーブル: friend_comments (from_user_id, to_user_id, body, created_at)
--  追加RPC:
--    add_friend_comment(p_to_user_id, p_body)
--    delete_friend_comment(p_comment_id)
--    get_friend_comments(p_to_user_id, p_limit default 30) … 1人ぶんの全文一覧
--    get_friend_comment_summary(p_to_user_ids uuid[])      … 一覧画面用（件数＋最新1件）
--
--  schema.sql 実行済みの環境で、この差分だけ SQL Editor で Run。
--  何度実行しても安全。
-- =====================================================================

create table if not exists public.friend_comments (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id   uuid not null references public.users(id) on delete cascade,
  body         text not null check (char_length(trim(body)) between 1 and 200),
  created_at   timestamptz not null default now(),
  constraint friend_comments_no_self check (from_user_id <> to_user_id)
);
create index if not exists friend_comments_to_created
  on public.friend_comments (to_user_id, created_at desc);

alter table public.friend_comments enable row level security;

drop policy if exists friend_comments_select on public.friend_comments;
drop policy if exists friend_comments_insert on public.friend_comments;
drop policy if exists friend_comments_delete on public.friend_comments;

-- そのカードを見られる人（本人 or acceptedなフレンド）なら誰でも読める
create policy friend_comments_select on public.friend_comments
  for select using (public.can_view_user_posts(to_user_id));

-- 投稿はRPC（security definer）経由のみ。直接insertはさせない運用にする
-- （自分宛てには書けない／可視範囲の相手にしか書けない、をDB側でも保証するため）

drop policy if exists friend_comments_delete_own on public.friend_comments;
create policy friend_comments_delete_own on public.friend_comments
  for delete using (from_user_id = auth.uid() or to_user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.friend_comments;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------

drop function if exists public.add_friend_comment(uuid, text);
create function public.add_friend_comment(p_to_user_id uuid, p_body text)
returns public.friend_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.friend_comments;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_to_user_id = v_me then raise exception 'CANNOT_COMMENT_SELF'; end if;
  if p_body is null or char_length(trim(p_body)) = 0 then raise exception 'BODY_REQUIRED'; end if;
  if char_length(trim(p_body)) > 200 then raise exception 'BODY_TOO_LONG'; end if;
  if not public.can_view_user_posts(p_to_user_id) then raise exception 'NOT_FRIENDS'; end if;

  insert into public.friend_comments (from_user_id, to_user_id, body)
  values (v_me, p_to_user_id, trim(p_body))
  returning * into v_row;
  return v_row;
end;
$$;

drop function if exists public.delete_friend_comment(uuid);
create function public.delete_friend_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from public.friend_comments
  where id = p_comment_id and (from_user_id = v_me or to_user_id = v_me);
  if not found then raise exception 'COMMENT_NOT_FOUND'; end if;
end;
$$;

-- 1人ぶんの全文一覧（新しい順）
drop function if exists public.get_friend_comments(uuid, int);
create function public.get_friend_comments(p_to_user_id uuid, p_limit int default 30)
returns table (
  comment_id   uuid,
  from_user_id uuid,
  from_name    text,
  from_avatar_url text,
  from_avatar_emoji text,
  body         text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.from_user_id, u.name, u.avatar_url, u.avatar_emoji, c.body, c.created_at
  from public.friend_comments c
  join public.users u on u.id = c.from_user_id
  where c.to_user_id = p_to_user_id
    and public.can_view_user_posts(p_to_user_id)
  order by c.created_at desc
  limit greatest(1, coalesce(p_limit, 30));
$$;

-- 一覧画面用（複数フレンド分の件数＋最新1件をまとめて取得）
drop function if exists public.get_friend_comment_summary(uuid[]);
create function public.get_friend_comment_summary(p_to_user_ids uuid[])
returns table (
  to_user_id   uuid,
  comment_count int,
  latest_body  text,
  latest_from_name text,
  latest_created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select unnest(p_to_user_ids) as uid
  ),
  v as (
    select uid from visible where public.can_view_user_posts(uid)
  ),
  latest as (
    select distinct on (c.to_user_id)
      c.to_user_id, c.body, u.name as from_name, c.created_at
    from public.friend_comments c
    join public.users u on u.id = c.from_user_id
    where c.to_user_id in (select uid from v)
    order by c.to_user_id, c.created_at desc
  )
  select
    v.uid,
    coalesce((select count(*)::int from public.friend_comments c where c.to_user_id = v.uid), 0),
    l.body,
    l.from_name,
    l.created_at
  from v
  left join latest l on l.to_user_id = v.uid;
$$;

revoke all on function public.add_friend_comment(uuid, text)      from public, anon;
revoke all on function public.delete_friend_comment(uuid)         from public, anon;
revoke all on function public.get_friend_comments(uuid, int)      from public, anon;
revoke all on function public.get_friend_comment_summary(uuid[])  from public, anon;

grant execute on function public.add_friend_comment(uuid, text)      to authenticated;
grant execute on function public.delete_friend_comment(uuid)         to authenticated;
grant execute on function public.get_friend_comments(uuid, int)      to authenticated;
grant execute on function public.get_friend_comment_summary(uuid[])  to authenticated;
