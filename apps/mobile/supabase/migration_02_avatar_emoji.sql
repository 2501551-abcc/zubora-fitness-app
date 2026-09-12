-- =====================================================================
--  マイグレーション #02 — アバター絵文字を users テーブルへ
-- ---------------------------------------------------------------------
--  目的: 設定画面で選んだアイコン絵文字を「フレンドからも見える」ようにする。
--        （これまでは auth.user_metadata のみ = 本人しか見えなかった）
--
--  schema.sql を実行済みの環境で、この差分だけ SQL Editor で Run。
--  何度実行しても安全。
-- =====================================================================

-- 1. カラム追加
alter table public.users
  add column if not exists avatar_emoji text not null default '✦';

-- 2. サインアップ時に metadata の avatar_emoji も取り込む
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := nullif(trim(new.raw_user_meta_data ->> 'name'), '');
  if v_name is null then
    v_name := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  end if;
  if v_name is null then
    v_name := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  if exists (select 1 from public.users u where lower(u.name) = lower(v_name)) then
    v_name := v_name || '_' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;

  insert into public.users (id, name, avatar_url, avatar_emoji, preferred_time_of_day, notification_enabled)
  values (
    new.id,
    v_name,
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(nullif(new.raw_user_meta_data ->> 'avatar_emoji', ''), '✦'),
    coalesce(nullif(new.raw_user_meta_data ->> 'preferred_time_of_day', '')::time, '20:00'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. フレンド一覧 RPC に avatar_emoji を追加（戻り値の型が変わるので drop→create）
drop function if exists public.get_friends_with_status();

create function public.get_friends_with_status()
returns table (
  user_id          uuid,
  name             text,
  avatar_url       text,
  avatar_emoji     text,
  is_online        boolean,
  last_seen        timestamptz,
  streak_days      int,
  rest_days        int,
  best_streak_days int,
  friends_since    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with my_friends as (
    select
      case when user_id_a = auth.uid() then user_id_b else user_id_a end as friend_id,
      created_at as friends_since
    from public.friendships
    where status = 'accepted'
      and (user_id_a = auth.uid() or user_id_b = auth.uid())
  )
  select
    u.id, u.name, u.avatar_url, u.avatar_emoji, u.is_online, u.last_seen,
    coalesce(s.streak_days, 0)::int,
    s.rest_days::int,
    coalesce(s.best_streak_days, 0)::int,
    mf.friends_since
  from my_friends mf
  join public.users u on u.id = mf.friend_id
  left join public.user_workout_stats s on s.user_id = mf.friend_id
  order by coalesce(s.streak_days, 0) desc, u.name asc;
$$;

revoke all on function public.get_friends_with_status() from public, anon;
grant execute on function public.get_friends_with_status() to authenticated;

-- 4. 既存ユーザーの avatar_emoji を metadata から埋め戻し（任意・一度きり）
update public.users u
set avatar_emoji = coalesce(nullif(a.raw_user_meta_data ->> 'avatar_emoji', ''), u.avatar_emoji)
from auth.users a
where a.id = u.id
  and (u.avatar_emoji is null or u.avatar_emoji = '✦');
