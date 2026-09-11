-- =====================================================================
--  女性向け宅トレアプリ — Supabase スキーマ（★これ1本だけ実行すればOK）
-- ---------------------------------------------------------------------
--  Supabase ダッシュボード > SQL Editor に全文貼り付けて Run。
--  既存テーブルに対する差分適用なので、何度実行しても壊れません。
--
--  既存テーブル（前提）:
--    users(id, name, avatar_url, preferred_time_of_day time,
--          notification_enabled, created_at, updated_at)
--    friendships(id, user_id_a, user_id_b, status text, created_at)
--    workout_logs(id bigint, created_at, user_id, menu_id bigint)
--    workout_menus / friend_posts / reactions / notifications … 変更なし
--
--  前提（違う場合は先に教えてください）:
--    - users.id = auth.users.id
--    - friendships.user_id_a = 申請者 / user_id_b = 申請された側
--    - workout_logs 1行 = 運動1回（created_at を実施日時とみなす）
--
--  やること:
--    1. users にオンライン状況カラム / 既定値 / 一意名 / トリガー
--    2. friendships に status制限 / updated_at / 重複防止 / FK
--    3. workout_logs 集計用インデックス
--    4. user_workout_stats ビュー（連続日数・お休み日数）
--    5. RLS 一式（users / friendships / workout_logs）
--    6. RPC: send_friend_request / respond_to_friend_request /
--            get_friends_with_status / get_incoming_friend_requests /
--            update_my_presence / delete_current_user
--    7. Realtime publication 登録
-- =====================================================================

create extension if not exists "pgcrypto";


-- =====================================================================
-- 1. users
-- =====================================================================
alter table public.users add column if not exists is_online    boolean     not null default false;
alter table public.users add column if not exists last_seen    timestamptz not null default now();
-- アバター絵文字（画像未設定時のフォールバック。フレンドからも見える）
alter table public.users add column if not exists avatar_emoji text        not null default '✦';
-- フレンドコード（例: ZBR-8A2K7X）。フレンド申請はこのコードのみで行う。
alter table public.users add column if not exists friend_code text;

-- サインアップ時にトリガー/クライアントが最小項目で insert できるよう既定値
alter table public.users alter column preferred_time_of_day set default '20:00';
alter table public.users alter column notification_enabled  set default true;
alter table public.users alter column created_at            set default now();
alter table public.users alter column updated_at            set default now();

-- 表示名は重複OK（自分の名前をそのまま使いたい人向け）。旧: lower(name) の一意 index は撤廃。
drop index if exists public.users_name_lower_unique;

-- フレンドコードの正規化（ハイフン・大小文字を無視して比較 / 一意判定）
create or replace function public.canon_friend_code(code text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- ランダムなフレンドコード生成（紛らわしい 0/O/1/I/L を除く 30 字から6桁 + ZBR-）
create or replace function public.gen_friend_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  candidate text;
  i int;
  attempt int := 0;
begin
  loop
    candidate := 'ZBR-';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.users
      where public.canon_friend_code(friend_code) = public.canon_friend_code(candidate)
    );
    attempt := attempt + 1;
    if attempt > 20 then
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      exit;
    end if;
  end loop;
  return candidate;
end;
$$;

create unique index if not exists users_friend_code_canon_key
  on public.users (public.canon_friend_code(friend_code))
  where friend_code is not null;

-- 既存ユーザーに採番（1行ずつ）→ 以後は必須＋既定値で自動採番
do $$
declare r record;
begin
  for r in select id from public.users where friend_code is null loop
    update public.users set friend_code = public.gen_friend_code() where id = r.id;
  end loop;
end $$;
alter table public.users alter column friend_code set default public.gen_friend_code();
alter table public.users alter column friend_code set not null;

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.tg_set_updated_at();

-- サインアップ時に users 行を自動作成
-- （既に別トリガーで作っているなら不要。二重作成防止で on conflict do nothing）
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
  -- 表示名は重複OKなのでサフィックス付与はしない。friend_code は列 default が自動採番。

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =====================================================================
-- 2. friendships
-- =====================================================================
-- status を 3 値に制限（既存に他の値があると失敗 → 先に UPDATE で寄せる）
alter table public.friendships drop constraint if exists friendships_status_check;
alter table public.friendships
  add constraint friendships_status_check check (status in ('pending', 'accepted', 'rejected'));

alter table public.friendships
  add column if not exists updated_at timestamptz not null default now();

alter table public.friendships drop constraint if exists friendships_no_self;
alter table public.friendships
  add constraint friendships_no_self check (user_id_a <> user_id_b);

-- A→B と B→A を二重に作らせない（順不同で 1 ペア 1 行）
create unique index if not exists friendships_unique_pair
  on public.friendships (least(user_id_a, user_id_b), greatest(user_id_a, user_id_b));

create index if not exists friendships_b_status on public.friendships (user_id_b, status);
create index if not exists friendships_a_status on public.friendships (user_id_a, status);

drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at
  before update on public.friendships
  for each row execute function public.tg_set_updated_at();

-- FK（無ければ付与）
do $$ begin
  alter table public.friendships
    add constraint friendships_user_a_fkey
    foreign key (user_id_a) references public.users (id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.friendships
    add constraint friendships_user_b_fkey
    foreign key (user_id_b) references public.users (id) on delete cascade;
exception when duplicate_object then null; end $$;


-- =====================================================================
-- 3. workout_logs
-- =====================================================================
create index if not exists workout_logs_user_created
  on public.workout_logs (user_id, created_at desc);

-- 実施時間（秒）。saveWorkoutSession() が result.completedSec を入れる。
alter table public.workout_logs
  add column if not exists duration_sec integer not null default 0;


-- =====================================================================
-- 4. user_workout_stats ビュー
--    workout_logs 1行 = 実施1回。created_at を JST 暦日に丸めて連続判定。
--    「今日 もしくは 昨日」に実施していれば連続中（就寝前の猶予）。
-- =====================================================================
create or replace view public.user_workout_stats
with (security_invoker = true) as
with days as (
  select
    user_id,
    (created_at at time zone 'Asia/Tokyo')::date as day
  from public.workout_logs
  where user_id is not null
  group by user_id, (created_at at time zone 'Asia/Tokyo')::date
),
grouped as (
  select
    user_id,
    day,
    day - (row_number() over (partition by user_id order by day))::int as streak_key
  from days
),
runs as (
  select user_id, streak_key, count(*)::int as len, max(day) as last_day
  from grouped
  group by user_id, streak_key
),
last_workout as (
  select user_id, max(day) as last_day from days group by user_id
)
select
  u.id as user_id,
  coalesce((
    select r.len from runs r
    where r.user_id = u.id
      and r.last_day >= ((now() at time zone 'Asia/Tokyo')::date - 1)
    order by r.last_day desc
    limit 1
  ), 0) as streak_days,
  lw.last_day as last_workout_day,
  case
    when lw.last_day is null then null
    else ((now() at time zone 'Asia/Tokyo')::date - lw.last_day)
  end as rest_days,
  coalesce((select max(r.len) from runs r where r.user_id = u.id), 0) as best_streak_days
from public.users u
left join last_workout lw on lw.user_id = u.id;


-- =====================================================================
-- 5. RLS
-- =====================================================================
alter table public.users        enable row level security;
alter table public.friendships  enable row level security;
alter table public.workout_logs enable row level security;

-- ---- users ---------------------------------------------------------
drop policy if exists users_select_self    on public.users;
drop policy if exists users_select_related on public.users;
drop policy if exists users_insert_self    on public.users;
drop policy if exists users_update_self    on public.users;

create policy users_select_self on public.users
  for select using (id = auth.uid());

-- フレンド(accepted) / 申請中(pending)の相手のプロフィールも見える
create policy users_select_related on public.users
  for select using (exists (
    select 1 from public.friendships f
    where f.status in ('accepted', 'pending')
      and ((f.user_id_a = auth.uid() and f.user_id_b = public.users.id)
        or (f.user_id_b = auth.uid() and f.user_id_a = public.users.id))
  ));

create policy users_insert_self on public.users
  for insert with check (id = auth.uid());

create policy users_update_self on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---- friendships --------------------------------------------------
drop policy if exists friendships_select_own on public.friendships;
drop policy if exists friendships_insert_own on public.friendships;
drop policy if exists friendships_update_own on public.friendships;
drop policy if exists friendships_delete_own on public.friendships;

create policy friendships_select_own on public.friendships
  for select using (user_id_a = auth.uid() or user_id_b = auth.uid());
create policy friendships_insert_own on public.friendships
  for insert with check (user_id_a = auth.uid());
create policy friendships_update_own on public.friendships
  for update using (user_id_a = auth.uid() or user_id_b = auth.uid())
             with check (user_id_a = auth.uid() or user_id_b = auth.uid());
create policy friendships_delete_own on public.friendships
  for delete using (user_id_a = auth.uid() or user_id_b = auth.uid());

-- ---- workout_logs ------------------------------------------------
--  ★注意: RLS 有効化後は「ログイン中ユーザーの id」で INSERT する必要があります。
--  services/workoutService.ts の固定 user_id は auth.uid() 相当に直してください。
drop policy if exists workout_logs_select_self    on public.workout_logs;
drop policy if exists workout_logs_select_friends on public.workout_logs;
drop policy if exists workout_logs_write_self     on public.workout_logs;
drop policy if exists workout_logs_update_self    on public.workout_logs;
drop policy if exists workout_logs_delete_self    on public.workout_logs;

create policy workout_logs_select_self on public.workout_logs
  for select using (user_id = auth.uid());
create policy workout_logs_select_friends on public.workout_logs
  for select using (exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.user_id_a = auth.uid() and f.user_id_b = public.workout_logs.user_id)
        or (f.user_id_b = auth.uid() and f.user_id_a = public.workout_logs.user_id))
  ));
create policy workout_logs_write_self on public.workout_logs
  for insert with check (user_id = auth.uid());
create policy workout_logs_update_self on public.workout_logs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy workout_logs_delete_self on public.workout_logs
  for delete using (user_id = auth.uid());


-- =====================================================================
-- 6. RPC（クライアントは supabase.rpc('関数名', {...}) で呼ぶ）
-- =====================================================================

-- 6-1. フレンド申請（フレンドコードで相手を検索）
drop function if exists public.send_friend_request(text);
create function public.send_friend_request(friend_code text)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_target   uuid;
  v_existing public.friendships;
  v_row      public.friendships;
  v_canon    text := public.canon_friend_code(friend_code);
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_canon = '' then raise exception 'USER_NOT_FOUND'; end if;

  select id into v_target from public.users u
  where public.canon_friend_code(u.friend_code) = v_canon;
  if v_target is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_target = v_me then raise exception 'CANNOT_ADD_SELF'; end if;

  select * into v_existing from public.friendships
  where least(user_id_a, user_id_b)    = least(v_me, v_target)
    and greatest(user_id_a, user_id_b) = greatest(v_me, v_target);

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'ALREADY_FRIENDS';
    elsif v_existing.status = 'pending' then
      raise exception 'ALREADY_REQUESTED';
    else
      update public.friendships
        set status = 'pending', user_id_a = v_me, user_id_b = v_target, created_at = now()
        where id = v_existing.id
        returning * into v_row;
      return v_row;
    end if;
  end if;

  insert into public.friendships (user_id_a, user_id_b, status)
  values (v_me, v_target, 'pending')
  returning * into v_row;
  return v_row;
end;
$$;

-- 6-2. 申請への応答（承認 / 拒否）
create or replace function public.respond_to_friend_request(p_request_id uuid, p_accept boolean)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.friendships;
begin
  if v_me is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.friendships
    set status = case when p_accept then 'accepted' else 'rejected' end,
        updated_at = now()
    where id = p_request_id and user_id_b = v_me and status = 'pending'
    returning * into v_row;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  return v_row;
end;
$$;

-- 6-3. フレンド一覧 + 継続 / お休み状況（継続日数の多い順。自分自身の行も含む）
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
  )
  select
    u.id, u.name, u.avatar_url, u.avatar_emoji, u.is_online, u.last_seen,
    coalesce(s.streak_days, 0)::int,
    s.rest_days::int,
    coalesce(s.best_streak_days, 0)::int,
    i.friends_since,
    i.is_self
  from ids i
  join public.users u on u.id = i.friend_id
  left join public.user_workout_stats s on s.user_id = i.friend_id
  order by coalesce(s.streak_days, 0) desc, u.name asc;
$$;

-- 6-4. 自分宛の未応答フレンド申請
create or replace function public.get_incoming_friend_requests()
returns table (
  request_id      uuid,
  from_user_id    uuid,
  from_name       text,
  from_avatar_url text,
  created_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.user_id_a, u.name, u.avatar_url, f.created_at
  from public.friendships f
  join public.users u on u.id = f.user_id_a
  where f.user_id_b = auth.uid() and f.status = 'pending'
  order by f.created_at desc;
$$;

-- 6-5. オンライン状態の更新
create or replace function public.update_my_presence(p_is_online boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.users set is_online = p_is_online, last_seen = now() where id = auth.uid();
$$;

-- 6-6. アカウント削除（関連データは FK cascade）
create or replace function public.delete_current_user()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;

-- 6-7. ホーム画面の実績（連続記録 / 今週の合計）
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

-- 6-8. 自分のフレンドコードを取得（無ければ採番して保存）
create or replace function public.get_my_friend_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select friend_code into v_code from public.users where id = auth.uid();
  if v_code is null or v_code = '' then
    v_code := public.gen_friend_code();
    update public.users set friend_code = v_code where id = auth.uid();
  end if;
  return v_code;
end;
$$;

revoke all on function public.send_friend_request(text)                from public, anon;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public, anon;
revoke all on function public.get_friends_with_status()                from public, anon;
revoke all on function public.get_incoming_friend_requests()           from public, anon;
revoke all on function public.update_my_presence(boolean)              from public, anon;
revoke all on function public.delete_current_user()                    from public, anon;
revoke all on function public.get_home_stats()                         from public, anon;
revoke all on function public.get_my_friend_code()                     from public, anon;

grant execute on function public.send_friend_request(text)                to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.get_friends_with_status()                to authenticated;
grant execute on function public.get_incoming_friend_requests()           to authenticated;
grant execute on function public.update_my_presence(boolean)              to authenticated;
grant execute on function public.delete_current_user()                    to authenticated;
grant execute on function public.get_home_stats()                         to authenticated;
grant execute on function public.get_my_friend_code()                     to authenticated;


-- =====================================================================
-- 7. Realtime
--    Presence（オンライン状況）は channel だけで動くので DB 不要。
--    下記は postgres_changes 購読用（申請の受信 / オンライン切替）。
-- =====================================================================
do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.users;
exception when duplicate_object then null; end $$;
