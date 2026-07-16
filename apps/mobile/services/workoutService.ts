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

import type { DurationOption, WorkoutResult } from '@/types/workout';
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
  console.log('[workoutService] saveWorkoutSession (Supabase送信開始):', result);

  try {
    const { data, error } = await supabase
      .from('workout_logs') // あなたが作成したSupabaseのテーブル名
      .insert([
        {
          user_id: 'test_user_fukuoka',           // テスト用の仮ユーザー名
          menu_id: 1,                             // テスト用のメニューID
          planned_seconds: result.plannedSec,     // 目標時間（秒）
          completed_seconds: result.completedSec, // 実際にやった時間（秒）
          level_difficulty: result.level,         // 難易度（easy, normal, hard）
          completed: result.completed,            // 完遂したか（true/false）
          started_at: result.startedAt,           // 開始日時
          ended_at: result.endedAt,               // 終了日時
        }
      ]);

    if (error) {
      console.error('Supabaseへの保存に失敗しました:', error.message);
    } else {
      console.log('Supabaseへの保存が完全に成功しました！ 🎉');
    }
  } catch (err) {
    console.error('通信エラーなど予期せぬ失敗:', err);
  }
}

/*export async function saveWorkoutSession(result: WorkoutResult): Promise<void> {
  console.log('[workoutService] saveWorkoutSession (stub):', result);
}
*/

/**
 * 連続達成日数（ストリーク）を返す。サマリー画面などで表示。
 * TODO(backend): workout_sessions を日付で集計して連続日数を算出する。
 * 現状はダミーで 5 を返す。
 */
export async function fetchStreakDays(): Promise<number> {
  return 5;
}
