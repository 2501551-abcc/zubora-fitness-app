/**
 * 目標ロードマップ機能の共有型（フロント / バックエンド共通の契約）
 * -------------------------------------------------------------
 * 設計ドラフト「AI担当_目標ブレイクダウン設計ドラフト v3」のJSONスキーマに準拠。
 *  - RoadmapInput  … 前提10問 + 大目標をまとめた、AIへの入力オブジェクト（セクション3）
 *  - Roadmap       … AIが返すツリー本体（セクション4）
 * バックエンドはこの型のまま Gemini(response_schema) と受け渡ししてください。
 */

/* ========== 入力（前提条件） ========== */

export type FrequencyLevel = 'none' | 'low' | 'high';
export type GoalFocus = 'core' | 'stamina' | 'posture' | 'stress_relief';
export type TimePerSession = '5' | '10' | '15_20' | 'flexible';
export type DaysPerWeek = '2' | '3_4' | '5plus' | 'unsure';
export type Equipment =
  | 'none'
  | 'mat'
  | 'dumbbells'
  | 'ab_roller'
  | 'resistance_band'
  | 'other_gym_equipment';
export type EnvironmentConstraint = 'quiet_small' | 'moderate' | 'unrestricted';
export type IntensityPreference = 'very_gentle' | 'moderate' | 'challenging';
export type MotivationStyle = 'no_pressure' | 'gradual_change' | 'achievement';

/** AIへ渡す入力オブジェクト（設計ドラフト セクション3） */
export interface RoadmapInput {
  /** 大目標の自由入力 */
  goal_text: string;
  frequency_level: FrequencyLevel;
  past_failure_experience: boolean;
  goal_focus: GoalFocus;
  time_per_session_minutes: TimePerSession;
  days_per_week: DaysPerWeek;
  /** 複数選択可。'none'（自重のみ）は他と排他 */
  equipment_list: Equipment[];
  environment_constraint: EnvironmentConstraint;
  intensity_preference: IntensityPreference;
  motivation_style: MotivationStyle;
  /** 4 / 12 / 24 / null（未定） */
  target_period_weeks: number | null;
}

/* ========== 出力（ツリー本体） ========== */

export interface RoadmapTask {
  task_id: string;
  order: number;
  week_number: number;
  title: string;
  description: string;
  /** 週あたりの実施回数（安全上限あり・最大6） */
  frequency_per_week: number;
  /** 既存メニューとの紐付けタグ（無ければ null） */
  workout_menu_tag: string | null;
}

export interface RoadmapMilestone {
  milestone_id: string;
  order: number;
  title: string;
  period_weeks: number;
  description: string;
  tasks: RoadmapTask[];
}

/** AIが生成する目標ツリー（設計ドラフト セクション4） */
export interface Roadmap {
  goal_id: string;
  /** AIが整形した短いタイトル */
  title: string;
  /** ユーザーの元の入力文（ラベルなし・本文のみ） */
  user_input_raw: string;
  target_period_weeks: number;
  milestones: RoadmapMilestone[];
}

/* ========== 質問フローの回答（画面内の作業用ステート） ========== */

/**
 * 10問の回答を貯める作業用オブジェクト。全問そろったら RoadmapInput に組み立てて
 * generateRoadmap() に渡す。未回答のうちは各フィールドが未定義。
 */
export interface RoadmapAnswers {
  frequency_level?: FrequencyLevel;
  past_failure_experience?: boolean;
  goal_focus?: GoalFocus;
  time_per_session_minutes?: TimePerSession;
  days_per_week?: DaysPerWeek;
  equipment_list?: Equipment[];
  environment_constraint?: EnvironmentConstraint;
  intensity_preference?: IntensityPreference;
  motivation_style?: MotivationStyle;
  target_period_weeks?: number | null;
}
