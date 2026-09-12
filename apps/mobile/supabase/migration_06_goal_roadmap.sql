-- =====================================================================
--  マイグレーション #06 — 目標ロードマップの永続化（複数端末で共有）
-- ---------------------------------------------------------------------
--  目的: 「この目標ではじめる」で確定したロードマップを Supabase に保存し、
--        どの端末でログインしても同じものが見えるようにする。
--        （それまでは端末内 AsyncStorage のみで、他端末には出なかった）
--
--  仕様: docs/goal-roadmap-persistence-spec.md
--  ※ このテーブル・RPCは Supabase 上には既に作成済みだったが、リポジトリの
--    schema.sql に反映されておらず、DB を作り直すと消えてしまう状態だった。
--    ここで schema.sql 側にも同じ内容を反映する（差分適用・再実行安全）。
--
--  schema.sql 実行済みの環境で、この差分だけ SQL Editor で Run 可。
-- =====================================================================

create table if not exists public.goal_trees (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  title               text not null default '',
  user_input_raw      text not null default '',
  target_period_weeks int  not null default 12,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);
create index if not exists goal_trees_user_active
  on public.goal_trees (user_id, is_active, created_at desc);

create table if not exists public.goal_milestones (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goal_trees(id) on delete cascade,
  order_index  int  not null,
  title        text not null default '',
  period_weeks int  not null default 1,
  description  text not null default ''
);
create index if not exists goal_milestones_goal on public.goal_milestones (goal_id, order_index);

create table if not exists public.goal_tasks (
  id                 uuid primary key default gen_random_uuid(),
  milestone_id       uuid not null references public.goal_milestones(id) on delete cascade,
  order_index        int  not null,
  week_number        int  not null default 1,
  title              text not null default '',
  description        text not null default '',
  frequency_per_week int  not null default 2,
  workout_menu_tag   text
);
create index if not exists goal_tasks_milestone on public.goal_tasks (milestone_id, order_index);

alter table public.goal_trees      enable row level security;
alter table public.goal_milestones enable row level security;
alter table public.goal_tasks      enable row level security;

drop policy if exists goal_trees_all_self      on public.goal_trees;
drop policy if exists goal_milestones_all_self on public.goal_milestones;
drop policy if exists goal_tasks_all_self      on public.goal_tasks;

create policy goal_trees_all_self on public.goal_trees
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy goal_milestones_all_self on public.goal_milestones
  for all using (exists (
    select 1 from public.goal_trees g
    where g.id = goal_milestones.goal_id and g.user_id = auth.uid()
  ));

create policy goal_tasks_all_self on public.goal_tasks
  for all using (exists (
    select 1 from public.goal_milestones m
    join public.goal_trees g on g.id = m.goal_id
    where m.id = goal_tasks.milestone_id and g.user_id = auth.uid()
  ));

-- 保存: 呼び出しユーザーの既存ロードマップを非アクティブ化し、新しいツリーを1本 insert
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

  insert into public.goal_trees (user_id, title, user_input_raw, target_period_weeks)
  values (
    v_uid,
    coalesce(p_roadmap->>'title', ''),
    coalesce(p_roadmap->>'user_input_raw', ''),
    coalesce((p_roadmap->>'target_period_weeks')::int, 12)
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

-- 取得: 呼び出しユーザーの is_active な最新ツリーを Roadmap 型そのままの JSON で返す
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

revoke all on function public.save_roadmap(jsonb) from public, anon;
revoke all on function public.get_current_roadmap()  from public, anon;
grant execute on function public.save_roadmap(jsonb) to authenticated;
grant execute on function public.get_current_roadmap()  to authenticated;
