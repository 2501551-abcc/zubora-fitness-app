/**
 * 筋トレ関連の共有型定義（フロント / バックエンド共通の契約）
 *
 * ここはフロントとバックエンドの「契約書」です。
 * UI 側はこの型だけに依存しているので、バックエンドは services/workoutService.ts
 * の中身を差し替えるだけで結合できます（この型のシグネチャは崩さないでください）。
 */

/** 筋トレの強度レベル */
export type WorkoutLevel = 'easy' | 'normal' | 'hard';

/** ドラムロールに並べる時間の選択肢（分） */
export interface DurationOption {
  /** 時間（分） */
  minutes: number;
  /** 表示ラベル（例: "15分"） */
  label: string;
}

/** 準備画面で確定した、筋トレ開始時のプラン */
export interface WorkoutPlan {
  /** 選択された筋トレ時間（秒） */
  durationSec: number;
  /** 選択された強度レベル */
  level: WorkoutLevel;
}

/**
 * 1回の筋トレ結果。筋トレ画面が完了/中断時にこの形で確定させ、
 * services/workoutService.saveWorkoutSession() に渡します。
 * バックエンドはこれをそのまま DB（例: Supabase の workout_sessions）へ保存する想定。
 */
export interface WorkoutResult {
  /** 開始時刻（ISO 8601） */
  startedAt: string;
  /** 終了時刻（ISO 8601） */
  endedAt: string;
  /** 予定していた時間（秒） */
  plannedSec: number;
  /** 実際に行った時間（秒） */
  completedSec: number;
  /** 強度レベル */
  level: WorkoutLevel;
  /** 予定時間まで完走したか（途中終了なら false） */
  completed: boolean;
}

/** レベルの表示ラベル（UI 用） */
export const LEVEL_LABELS: Record<WorkoutLevel, string> = {
  easy: 'ゆる',
  normal: 'ふつう',
  hard: 'がっつり',
};
