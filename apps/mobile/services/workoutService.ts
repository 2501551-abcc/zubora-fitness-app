/**
 * 筋トレのデータ層（バックエンド接合部）
 * =====================================================================
 * ★バックエンド担当へ★
 * UI はこのファイルの「関数シグネチャ」だけに依存しています。
 * 各関数の中身（現状はスタブ）を実データ通信に差し替えれば結合完了です。
 *   - 関数名・引数・戻り値の型は変更しないでください（変えると UI 修正が必要）。
 *   - Supabase クライアントは既に依存に入っています（@supabase/supabase-js）。
 *   - 置き換え箇所は「TODO(backend):」で全てマークしてあります。
 * =====================================================================
 */

import { DEFAULT_REMINDER_HOUR, pushWidgetSnapshot } from '@/lib/widget-bridge';
import type { DurationOption, HomeStats, PoseAnalysisResult, WorkoutMenuItem, WorkoutResult } from '@/types/workout';
import { supabase } from '../supabase';

/** ドラムロールに表示する時間の候補（分）。ずぼら向けに短い刻みも用意。 */
const DURATION_MINUTES = [1, 3, 5, 10, 15, 20, 25, 30, 40, 45, 60] as const;

/**
 * ドラムロール用の時間選択肢を返す。
 * TODO(backend): ユーザーごとに候補を出し分けたい場合はここでサーバーから取得する。
 * 現状は固定リストを返すだけ（通信不要）。
 */
export function getDurationOptions(): DurationOption[] {
  return DURATION_MINUTES.map((minutes) => ({
    minutes,
    label: `${minutes}分`,
  }));
}

/**
 * 準備画面の初期選択にする「おすすめ / 前回の時間」（秒）。
 * TODO(backend): プロフィールや目標(goal)、前回セッションから返す。
 * 例) const { data } = await supabase.from('profiles').select('default_duration_sec')...
 * 現状はダミーで 15 分を返す。
 */
export async function fetchDefaultDurationSec(): Promise<number> {
  return 15 * 60;
}

/**
 * 筋トレ結果を保存する。筋トレ画面が完了 or 中断時に呼ぶ。
 * TODO(backend): Supabase の workout_sessions などへ INSERT し、
 *                目標(goal)の進捗更新やタイムライン投稿の起点にする。
 * 例)
 *   await supabase.from('workout_sessions').insert({
 *     started_at: result.startedAt,
 *     ended_at: result.endedAt,
 *     planned_sec: result.plannedSec,
 *     completed_sec: result.completedSec,
 *     level: result.level,
 *     completed: result.completed,
 *   });
 * 現状はコンソール出力のみ（フロント単体で動作確認できるように）。
 */

export async function saveWorkoutSession(result: WorkoutResult): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.warn('[workoutService] 未ログインのため保存をスキップしました');
    return;
  }

  try {
    // workout_logs は RLS 有効。created_at は DB 側 default now()（= 実施日時）。
    // menu_id は現状 UI に無いため未指定。強度・完走可否を残したくなったらカラム追加。
    const { error } = await supabase.from('workout_logs').insert({
      user_id: user.id,
      duration_sec: Math.max(0, Math.round(result.completedSec)),
    });
    if (error) console.error('[workoutService] 保存に失敗:', error.message);
  } catch (err) {
    console.error('[workoutService] 保存で予期せぬエラー:', err);
  }

  // ホーム画面ウィジェットを更新（連続日数・最終実施日時）。iOS 以外は no-op。
  try {
    const streakDays = await fetchStreakDays();
    pushWidgetSnapshot({
      streakDays,
      lastWorkoutAt: result.endedAt,
      reminderHour: DEFAULT_REMINDER_HOUR,
    });
  } catch (err) {
    console.warn('[workoutService] ウィジェット更新をスキップ:', err);
  }
}

/**
 * ホーム画面の実績（連続記録 / 今週の合計）をまとめて取得。
 * 未ログイン時やエラー時はすべて 0。
 */
export async function fetchHomeStats(): Promise<HomeStats> {
  const empty: HomeStats = { streakDays: 0, weekMinutes: 0, weekWorkouts: 0 };
  try {
    const { data, error } = await supabase.rpc('get_home_stats').single();
    if (error || !data) return empty;
    const row = data as {
      streak_days: number | null;
      week_minutes: number | null;
      week_workouts: number | null;
    };
    return {
      streakDays: row.streak_days ?? 0,
      weekMinutes: row.week_minutes ?? 0,
      weekWorkouts: row.week_workouts ?? 0,
    };
  } catch {
    return empty;
  }
}

/**
 * 連続達成日数（ストリーク）を返す。サマリー画面・ウィジェット更新で使用。
 * 未ログイン時やエラー時は 0。
 */
export async function fetchStreakDays(): Promise<number> {
  const { streakDays } = await fetchHomeStats();
  return streakDays;
}

/**
 * 「メニューを選ぶ」画面が表示する、DB(workout_menus)に登録された種目一覧を取得する。
 * 事前に supabase/migration_03_workout_menus.sql を実行しておく必要がある。
 */
export async function fetchWorkoutMenus(): Promise<WorkoutMenuItem[]> {
  const { data, error } = await supabase
    .from('workout_menus')
    .select('id, exercise_key, name, description, analysis_type, target_reps')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[workoutService] fetchWorkoutMenus failed:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    exerciseKey: row.exercise_key,
    name: row.name,
    description: row.description,
    analysisType: row.analysis_type,
    targetReps: row.target_reps,
  }));
}

/**
 * フォーム判定（スクワットなど）セッションの結果を保存する。
 * app/workout/pose-analysis.tsx がセッション終了時に呼ぶ。
 * pose判定も「運動1回」として既存の workout_logs に保存する
 * （streak集計・RLSなど既存の仕組みをそのまま使うため。saveWorkoutSessionと同じ認証パターン）。
 */
export async function savePoseAnalysisResult(result: PoseAnalysisResult): Promise<void> {
  console.log('[workoutService] savePoseAnalysisResult:', result);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.warn('[workoutService] 未ログインのため保存をスキップしました');
    return;
  }

  try {
    const { error } = await supabase.from('workout_logs').insert({
      user_id: user.id,
      ...(result.menuId !== undefined ? { menu_id: result.menuId } : {}),
      total_reps: result.totalReps,
      good_reps: result.goodReps,
      rep_log: result.repLog,
    });

    if (error) {
      console.error('[workoutService] pose結果の保存に失敗:', error.message);
    } else {
      console.log('[workoutService] pose結果の保存に成功 🎉');
    }
  } catch (err) {
    console.error('[workoutService] savePoseAnalysisResult 通信エラー:', err);
  }

  // ホーム画面ウィジェットを更新（saveWorkoutSessionと同様）
  try {
    const streakDays = await fetchStreakDays();
    pushWidgetSnapshot({
      streakDays,
      lastWorkoutAt: new Date().toISOString(),
      reminderHour: DEFAULT_REMINDER_HOUR,
    });
  } catch (err) {
    console.warn('[workoutService] ウィジェット更新をスキップ:', err);
  }
}

