-- =====================================================================
--  マイグレーション #04 — 表示名の重複を許可 ＋ フレンドコード導入
-- ---------------------------------------------------------------------
--  ・users.name の一意制約を撤廃（自分の名前をそのまま使いたい人向け）
--  ・users.friend_code（例: ZBR-8A2K7X）を追加し、フレンド申請はコードのみ
--
--  schema.sql 実行済みの環境で、この差分だけ SQL Editor で Run。
--  何度実行しても安全。schema.sql 側にも反映済み。
-- =====================================================================

-- 1. 表示名の一意制約を撤廃（重複OK）
drop index if exists public.users_name_lower_unique;

-- 2. フレンドコード列
alter table public.users add column if not exists friend_code text;

-- 3. 正規化（比較・一意判定用。ハイフンや大小文字を無視）
create or replace function public.canon_friend_code(code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- 4. ランダムなフレンドコード生成（紛らわしい文字 0/O/1/I/L を除く 30 字から6桁）
create or replace function public.gen_friend_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
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

-- 5. 正規化後の一意インデックス
create unique index if not exists users_friend_code_canon_key
  on public.users (public.canon_friend_code(friend_code))
  where friend_code is not null;

-- 6. 既存ユーザーに採番（1行ずつ → gen_friend_code が直前の結果を見て重複回避）
do $$
declare r record;
begin
  for r in select id from public.users where friend_code is null loop
    update public.users set friend_code = public.gen_friend_code() where id = r.id;
  end loop;
end $$;

-- 7. 以後は必須 ＋ 既定値で自動採番
alter table public.users alter column friend_code set default public.gen_friend_code();
alter table public.users alter column friend_code set not null;

-- 8. サインアップトリガー：名前重複時のサフィックス付与をやめる（重複OKにした）
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

  insert into public.users (id, name, avatar_url, avatar_emoji, preferred_time_of_day, notification_enabled)
  values (
    new.id,
    v_name,
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(nullif(new.raw_user_meta_data ->> 'avatar_emoji', ''), '✦'),
    coalesce(nullif(new.raw_user_meta_data ->> 'preferred_time_of_day', '')::time, '20:00'),
    true
  )
  on conflict (id) do nothing;  -- friend_code は列 default が自動採番
  return new;
end;
$$;

-- 9. フレンド申請：ユーザー名 → フレンドコードで検索するように差し替え
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

-- 10. 自分のフレンドコードを取得（無ければ採番して保存）
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

revoke all on function public.send_friend_request(text) from public, anon;
revoke all on function public.get_my_friend_code()      from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.get_my_friend_code()      to authenticated;
