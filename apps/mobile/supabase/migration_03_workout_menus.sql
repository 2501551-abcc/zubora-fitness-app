-- =====================================================================
--  マイグレーション #03 — メニュー一覧 と スクワット解析の結果保存
-- ---------------------------------------------------------------------
--  目的: 「筋トレを始める」→ メニュー選択 → スクワットのようなpose系メニューは
--        カメラでフォーム判定 → 結果を workout_logs に保存、という流れを追加する。
--
--  schema.sql を実行済みの環境で、この差分だけ SQL Editor で Run。
--  何度実行しても安全（create/alter は if not exists、insertはon conflict）。
--
--  設計方針:
--    - pose判定の結果も「運動1回」なので、新しいテーブルを作らず
--      既存の workout_logs に列を追加するだけにした。
--      → user_workout_stats（連続日数）に自動で乗る、RLSも追加不要、
--        という既存資産をそのまま使えるメリットがある。
--    - workout_menus は schema.sql のコメントで「既存テーブル」前提として
--      触れられているが、実体を定義するSQLがリポジトリ内に見当たらなかったため、
--      本マイグレーションで作成 or 不足カラムの補完を行う（create/alterともに
--      if not exists なので、既に存在していても安全に上書きなく整合する）。
-- =====================================================================


-- =====================================================================
-- 1. workout_menus（メニュー一覧）
-- =====================================================================
create table if not exists public.workout_menus (
  id bigint generated always as identity primary key
);

-- 既存テーブルに対しても、不足しているカラムだけ補う
alter table public.workout_menus add column if not exists exercise_key text;
alter table public.workout_menus add column if not exists name         text;
alter table public.workout_menus add column if not exists description  text;
-- 'pose'  : カメラでフォーム判定するタイプ（今回のスクワットなど）
-- 'timer' : 既存の時間タイマー式（/workout/prepare のフロー）
alter table public.workout_menus add column if not exists analysis_type text not null default 'timer';
alter table public.workout_menus add column if not exists target_reps  integer; -- pose系のみ使用（目標回数）
alter table public.workout_menus add column if not exists sort_order   integer not null default 0;
alter table public.workout_menus add column if not exists is_active    boolean not null default true;
alter table public.workout_menus add column if not exists created_at   timestamptz not null default now();

alter table public.workout_menus drop constraint if exists workout_menus_analysis_type_check;
alter table public.workout_menus
  add constraint workout_menus_analysis_type_check check (analysis_type in ('timer', 'pose'));

create unique index if not exists workout_menus_exercise_key_unique on public.workout_menus (exercise_key);

comment on table public.workout_menus is 'ホーム→「メニューを選ぶ」画面に表示する種目一覧';
comment on column public.workout_menus.exercise_key is 'cv/pose/exerciseConfig.ts の EXERCISE_CONFIGS キーと一致させること（pose系のみ使用）';

-- メニュー一覧は認証済みユーザーなら誰でも読める（機微情報ではないため）
alter table public.workout_menus enable row level security;

drop policy if exists workout_menus_select_authenticated on public.workout_menus;
create policy workout_menus_select_authenticated on public.workout_menus
  for select
  using (auth.role() = 'authenticated');

-- 「スクワット」をメニューに登録
insert into public.workout_menus (exercise_key, name, description, analysis_type, target_reps, sort_order)
values (
  'squat',
  'スクワット',
  'カメラでフォームを判定しながら、正しいフォームで10回行います',
  'pose',
  10,
  1
)
on conflict (exercise_key) do update set
  name          = excluded.name,
  description   = excluded.description,
  analysis_type = excluded.analysis_type,
  target_reps   = excluded.target_reps,
  sort_order    = excluded.sort_order,
  is_active     = true;


-- =====================================================================
-- 2. workout_logs（既存テーブルにpose判定の結果を保存できるよう列を追加）
--    RLS・streak集計（user_workout_stats）は既存の仕組みをそのまま利用する。
-- =====================================================================
alter table public.workout_logs add column if not exists total_reps integer; -- 実施回数
alter table public.workout_logs add column if not exists good_reps  integer; -- 正しいフォームだった回数
-- [{ repNumber, score, advice, isGoodForm }, ...]（PoseFormEvaluator.RepLogと同じ形）
alter table public.workout_logs add column if not exists rep_log    jsonb;

comment on column public.workout_logs.total_reps is 'pose系メニューのみ使用。実施回数';
comment on column public.workout_logs.good_reps  is 'pose系メニューのみ使用。正しいフォームだった回数';
comment on column public.workout_logs.rep_log    is 'pose系メニューのみ使用。各回のスコア・アドバイスのログ';
