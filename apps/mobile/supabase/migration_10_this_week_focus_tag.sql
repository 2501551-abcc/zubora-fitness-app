-- =====================================================================
--  マイグレーション #08 — 「今週の目標」に workout_menu_tag を追加
-- ---------------------------------------------------------------------
--  目的: 「筋トレを始める」で、ロードマップの今週のタスクが指定する
--  workout_menu_tag を実際のセッションに反映できるようにする。
--  get_this_week_focus() の返り値に workout_menu_tag を1フィールド追加するだけ。
--
--  schema.sql / migration_07_this_week_focus.sql 実行済みの環境で、
--  この差分だけ SQL Editor で Run。何度実行しても安全。
--  schema.sql 側にも反映済み。
-- =====================================================================

create or replace function public.get_this_week_focus()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select * from public.goal_trees
    where user_id = auth.uid() and is_active
    order by created_at desc
    limit 1
  ),
  week_calc as (
    select
      a.*,
      greatest(1, (
        ((now() at time zone 'Asia/Tokyo')::date - (a.created_at at time zone 'Asia/Tokyo')::date) / 7
      ) + 1) as current_week
    from active a
  ),
  chosen as (
    select t.title, t.description, t.frequency_per_week, t.workout_menu_tag, m.title as milestone_title
    from week_calc w
    join public.goal_milestones m on m.goal_id = w.id
    join public.goal_tasks t on t.milestone_id = m.id
    where t.week_number <= w.current_week
    order by t.week_number desc
    limit 1
  )
  select case when w.id is null then null else jsonb_build_object(
    'roadmap_title', w.title,
    'current_week', w.current_week,
    'target_period_weeks', w.target_period_weeks,
    'is_complete', w.current_week > w.target_period_weeks,
    'milestone_title', c.milestone_title,
    'task_title', c.title,
    'task_description', c.description,
    'frequency_per_week', c.frequency_per_week,
    'workout_menu_tag', c.workout_menu_tag
  ) end
  from week_calc w
  left join chosen c on true;
$$;

revoke all on function public.get_this_week_focus() from public, anon;
grant execute on function public.get_this_week_focus() to authenticated;
