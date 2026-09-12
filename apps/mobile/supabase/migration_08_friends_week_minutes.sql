-- =====================================================================
--  マイグレーション #08 — フレンド一覧に「今週の筋トレ合計時間」を追加
-- ---------------------------------------------------------------------
--  get_friends_with_status() が返す行に week_minutes（今週・JST月曜始まり
--  の workout_logs.duration_sec 合計、分換算）を追加する。
--  ホーム画面の get_home_stats() と同じ「週」の定義。
--
--  schema.sql 実行済みの環境で、この差分だけ SQL Editor で Run。
--  何度実行しても安全。schema.sql 側にも反映済み。
-- =====================================================================

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
  week_minutes     int,
  friends_since    timestamptz,
  is_self          boolean
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
  ),
  ids as (
    select friend_id, friends_since, false as is_self from my_friends
    union all
    select auth.uid(), now(), true
    where auth.uid() is not null
  ),
  wk as (
    select date_trunc('week', (now() at time zone 'Asia/Tokyo'))::date as start_day
  ),
  week_totals as (
    select w.user_id, sum(w.duration_sec) as total_sec
    from public.workout_logs w, wk
    where (w.created_at at time zone 'Asia/Tokyo')::date >= wk.start_day
    group by w.user_id
  )
  select
    u.id, u.name, u.avatar_url, u.avatar_emoji, u.is_online, u.last_seen,
    coalesce(s.streak_days, 0)::int,
    s.rest_days::int,
    coalesce(s.best_streak_days, 0)::int,
    coalesce(round(wt.total_sec / 60.0), 0)::int,
    i.friends_since,
    i.is_self
  from ids i
  join public.users u on u.id = i.friend_id
  left join public.user_workout_stats s on s.user_id = i.friend_id
  left join week_totals wt on wt.user_id = i.friend_id
  order by coalesce(s.streak_days, 0) desc, u.name asc;
$$;

revoke all on function public.get_friends_with_status() from public, anon;
grant execute on function public.get_friends_with_status() to authenticated;
