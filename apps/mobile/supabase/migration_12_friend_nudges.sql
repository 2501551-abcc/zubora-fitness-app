-- =====================================================================
--  マイグレーション #12 — 運動していないフレンドへの「応援ナッジ」
-- ---------------------------------------------------------------------
--  workout_logs に対するリアクション（migration_11）とは別物。
--  運動記録の有無に関わらず、フレンド本人に直接絵文字を送れる
--  （「😭サボってるの心配してるよ」「📣一緒にやろう」等）。
--  スパム防止のため、同じ相手には1日1回まで（JST暦日）。
--  有効期限: 送信から24時間を過ぎたリアクションは誰からも見えなくなる
--  （RLS・RPCの両方で created_at > now() - 24h を条件に含める）。
--  実データも pg_cron で1時間おきに物理削除する。
--
--  追加テーブル: friend_nudges (from_user_id, to_user_id, emoji, created_at)
--  追加RPC: send_friend_nudge(p_to_user_id, p_emoji)
--           get_my_nudges_sent_today()  … 今日もう送った相手一覧（ボタンのdisabled用）
--           get_my_received_nudges(p_limit) … 自分が受け取ったリアクション一覧（新しい順）
--
--  schema.sql 実行済みの環境で、この差分だけ SQL Editor で Run。
--  何度実行しても安全。
-- =====================================================================

create table if not exists public.friend_nudges (
  id           uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id   uuid not null references public.users(id) on delete cascade,
  emoji        text not null default '📣',
  created_at   timestamptz not null default now(),
  constraint friend_nudges_no_self check (from_user_id <> to_user_id)
);

-- 同じ相手には1日1回まで（JST暦日で判定）
create unique index if not exists friend_nudges_one_per_day
  on public.friend_nudges (from_user_id, to_user_id, ((created_at at time zone 'Asia/Tokyo')::date));

create index if not exists friend_nudges_to_created
  on public.friend_nudges (to_user_id, created_at desc);

alter table public.friend_nudges enable row level security;

-- 送信から24時間を過ぎたものは誰からも見えない
drop policy if exists friend_nudges_select_own on public.friend_nudges;
create policy friend_nudges_select_own on public.friend_nudges
  for select using (
    created_at > now() - interval '24 hours'
    and (from_user_id = auth.uid() or to_user_id = auth.uid())
  );

-- insert / delete はRPC（security definer）経由のみ。直接の書き込みはさせない。

-- ---------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------

-- 送信（フレンド＝accepted限定。1日1回を超えると ALREADY_NUDGED_TODAY）
drop function if exists public.send_friend_nudge(uuid, text);
create function public.send_friend_nudge(p_to_user_id uuid, p_emoji text)
returns public.friend_nudges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.friend_nudges;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_to_user_id = v_me then raise exception 'CANNOT_NUDGE_SELF'; end if;
  if p_emoji is null or trim(p_emoji) = '' then raise exception 'EMOJI_REQUIRED'; end if;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.user_id_a = v_me and f.user_id_b = p_to_user_id)
        or (f.user_id_b = v_me and f.user_id_a = p_to_user_id))
  ) then
    raise exception 'NOT_FRIENDS';
  end if;

  begin
    insert into public.friend_nudges (from_user_id, to_user_id, emoji)
    values (v_me, p_to_user_id, p_emoji)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'ALREADY_NUDGED_TODAY';
  end;

  return v_row;
end;
$$;

-- 今日すでに送った相手一覧（ボタンをdisabledにするため）
drop function if exists public.get_my_nudges_sent_today();
create function public.get_my_nudges_sent_today()
returns table (to_user_id uuid, emoji text)
language sql
stable
security definer
set search_path = public
as $$
  select n.to_user_id, n.emoji
  from public.friend_nudges n
  where n.from_user_id = auth.uid()
    and (n.created_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date;
$$;

-- 自分が受け取ったリアクション一覧（新しい順。送ってきた人の名前/アバター付き）
drop function if exists public.get_my_received_nudges(int);
create function public.get_my_received_nudges(p_limit int default 20)
returns table (
  from_user_id uuid,
  from_name    text,
  from_avatar_url text,
  from_avatar_emoji text,
  emoji        text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.from_user_id, u.name, u.avatar_url, u.avatar_emoji, n.emoji, n.created_at
  from public.friend_nudges n
  join public.users u on u.id = n.from_user_id
  where n.to_user_id = auth.uid()
    and n.created_at > now() - interval '24 hours'
  order by n.created_at desc
  limit greatest(1, coalesce(p_limit, 20));
$$;

revoke all on function public.send_friend_nudge(uuid, text) from public, anon;
revoke all on function public.get_my_nudges_sent_today()     from public, anon;
revoke all on function public.get_my_received_nudges(int)    from public, anon;
grant execute on function public.send_friend_nudge(uuid, text) to authenticated;
grant execute on function public.get_my_nudges_sent_today()     to authenticated;
grant execute on function public.get_my_received_nudges(int)    to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.friend_nudges;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 24時間を過ぎたリアクションの物理削除（1時間おき、pg_cron）
-- ---------------------------------------------------------------------
-- 上のRLS/RPCのフィルタだけで「24時間経ったら誰にも見えない」は既に保証済み。
-- これは実データをテーブルに残し続けないための掃除用（pg_cronが無効でも
-- アプリの見え方には影響しない）。
create or replace function public.purge_expired_friend_nudges()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.friend_nudges where created_at <= now() - interval '24 hours';
$$;

revoke all on function public.purge_expired_friend_nudges() from public, anon, authenticated;

do $$ begin
  create extension if not exists pg_cron;
exception when insufficient_privilege then
  raise notice 'pg_cron を自動作成できませんでした。Supabaseダッシュボード > Database > Extensions で pg_cron を有効化してから、このファイルをもう一度実行してください。';
end $$;

do $$ begin
  perform cron.unschedule('purge_expired_friend_nudges_hourly');
exception when others then null; end $$;

do $$ begin
  perform cron.schedule(
    'purge_expired_friend_nudges_hourly',
    '0 * * * *',
    $cron$select public.purge_expired_friend_nudges();$cron$
  );
exception when others then
  raise notice 'pg_cronのスケジュール登録に失敗しました（拡張が未有効化の可能性）。見え方には影響しません。';
end $$;
