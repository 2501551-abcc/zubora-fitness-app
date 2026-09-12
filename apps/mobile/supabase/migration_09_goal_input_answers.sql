-- =====================================================================
--  マイグレーション #09 — ロードマップに前提10問の回答一式を保存する
-- ---------------------------------------------------------------------
--  これまで goal_trees には大目標の自由入力（user_input_raw）しか保存して
--  おらず、ロードマップ画面の「入力した内容を見る」も大目標しか出せなかった。
--  前提10問の回答一式（頻度・目的・時間・器具など）を input_answers(jsonb)
--  として保存し、save_roadmap / get_current_roadmap 経由で読み書きできる
--  ようにする。
--
--  schema.sql 実行済みの環境で、この差分だけ SQL Editor で Run。
--  何度実行しても安全。schema.sql 側にも反映済み。
-- =====================================================================

alter table public.goal_trees add column if not exists input_answers jsonb not null default '{}'::jsonb;

create or replace function public.save_roadmap(p_roadmap jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_goal  uuid;
  v_ms    jsonb;
  v_task  jsonb;
  v_msid  uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.goal_trees set is_active = false where user_id = v_uid and is_active;

  insert into public.goal_trees (user_id, title, user_input_raw, target_period_weeks, input_answers)
  values (
    v_uid,
    coalesce(p_roadmap->>'title', ''),
    coalesce(p_roadmap->>'user_input_raw', ''),
    coalesce((p_roadmap->>'target_period_weeks')::int, 12),
    coalesce(p_roadmap->'input_answers', '{}'::jsonb)
  )
  returning id into v_goal;

  for v_ms in select * from jsonb_array_elements(coalesce(p_roadmap->'milestones', '[]'::jsonb))
  loop
    insert into public.goal_milestones (goal_id, order_index, title, period_weeks, description)
    values (
      v_goal,
      coalesce((v_ms->>'order')::int, 1),
      coalesce(v_ms->>'title', ''),
      coalesce((v_ms->>'period_weeks')::int, 1),
      coalesce(v_ms->>'description', '')
    )
    returning id into v_msid;

    for v_task in select * from jsonb_array_elements(coalesce(v_ms->'tasks', '[]'::jsonb))
    loop
      insert into public.goal_tasks
        (milestone_id, order_index, week_number, title, description, frequency_per_week, workout_menu_tag)
      values (
        v_msid,
        coalesce((v_task->>'order')::int, 1),
        coalesce((v_task->>'week_number')::int, 1),
        coalesce(v_task->>'title', ''),
        coalesce(v_task->>'description', ''),
        coalesce((v_task->>'frequency_per_week')::int, 2),
        nullif(v_task->>'workout_menu_tag', '')
      );
    end loop;
  end loop;

  return v_goal;
end;
$$;

create or replace function public.get_current_roadmap()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when g.id is null then null else jsonb_build_object(
    'goal_id', g.id,
    'title', g.title,
    'user_input_raw', g.user_input_raw,
    'target_period_weeks', g.target_period_weeks,
    'input_answers', g.input_answers,
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'milestone_id', m.id,
        'order', m.order_index,
        'title', m.title,
        'period_weeks', m.period_weeks,
        'description', m.description,
        'tasks', coalesce((
          select jsonb_agg(jsonb_build_object(
            'task_id', t.id,
            'order', t.order_index,
            'week_number', t.week_number,
            'title', t.title,
            'description', t.description,
            'frequency_per_week', t.frequency_per_week,
            'workout_menu_tag', t.workout_menu_tag
          ) order by t.order_index)
          from public.goal_tasks t where t.milestone_id = m.id
        ), '[]'::jsonb)
      ) order by m.order_index)
      from public.goal_milestones m where m.goal_id = g.id
    ), '[]'::jsonb)
  ) end
  from (
    select * from public.goal_trees
    where user_id = auth.uid() and is_active
    order by created_at desc limit 1
  ) g;
$$;

revoke all on function public.save_roadmap(jsonb)   from public, anon;
revoke all on function public.get_current_roadmap() from public, anon;
grant execute on function public.save_roadmap(jsonb)   to authenticated;
grant execute on function public.get_current_roadmap() to authenticated;
