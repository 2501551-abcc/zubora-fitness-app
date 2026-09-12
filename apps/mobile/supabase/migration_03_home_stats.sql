-- =====================================================================
--  マイグレーション #03 — ホーム画面の実績（連続記録 / 今週の合計）
-- ---------------------------------------------------------------------
--  目的: ホーム画面の「連続記録」「今週の合計（分）」を実データにする。
--        これまではフロント側のダミー値（5日 / 38分）を表示していた。
--
--  schema.sql 実行済みの環境で、この差分だけ SQL Editor で Run。
--  何度実行しても安全。schema.sql 側にも同じ内容を反映済み。
-- =====================================================================

-- 1. 実施時間（秒）を workout_logs に持たせる
--    saveWorkoutSession() が result.completedSec を入れる。既存行は 0。
alter table public.workout_logs
  add column if not exists duration_sec integer not null default 0;

-- 2. ホーム画面用の集計を 1 回の RPC で返す
--    streak_days   : 連続実施日数（user_workout_stats ビュー）
--    week_minutes  : 今週（JST・月曜はじまり）の実施時間合計（分）
--    week_workouts : 今週の実施回数
create or replace function public.get_home_stats()
returns table (
  streak_days   integer,
  week_minutes  integer,
  week_workouts integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with wk as (
    select date_trunc('week', (now() at time zone 'Asia/Tokyo'))::date as start_day
  ),
  this_week as (
    select w.duration_sec
    from public.workout_logs w, wk
    where w.user_id = auth.uid()
      and (w.created_at at time zone 'Asia/Tokyo')::date >= wk.start_day
  )
  select
    coalesce(
      (select s.streak_days from public.user_workout_stats s where s.user_id = auth.uid()),
      0
    )::integer,
    coalesce((select round(sum(duration_sec) / 60.0) from this_week), 0)::integer,
    coalesce((select count(*) from this_week), 0)::integer;
$$;

revoke all on function public.get_home_stats() from public, anon;
grant execute on function public.get_home_stats() to authenticated;
