/**
 * 前提10問の設定（データ駆動）。
 * questions.tsx はこの配列を順に回すだけなので、質問の増減や文言変更はここだけで済みます。
 * value は設計ドラフトのフィールド値に対応。
 */

import type { RoadmapAnswers } from '@/types/goal';

export type QuestionKind = 'single' | 'multi' | 'boolean';

/** 選択肢の値。文字列・数値・真偽・null（期間未定）を許容 */
export type OptionValue = string | number | boolean | null;

export interface QuestionOption {
  value: OptionValue;
  label: string;
}

export interface GoalQuestion {
  /** RoadmapAnswers のどのフィールドに入れるか */
  field: keyof RoadmapAnswers;
  kind: QuestionKind;
  title: string;
  hint?: string;
  options: QuestionOption[];
  /** multi のとき、これを選ぶと他が全部外れる（例: 自重のみ） */
  exclusiveValue?: OptionValue;
}

export const GOAL_QUESTIONS: GoalQuestion[] = [
  {
    field: 'frequency_level',
    kind: 'single',
    title: '今、運動する頻度は？',
    options: [
      { value: 'none', label: 'ほぼしない' },
      { value: 'low', label: '週1-2回' },
      { value: 'high', label: '週3回以上' },
    ],
  },
  {
    field: 'past_failure_experience',
    kind: 'boolean',
    title: '過去に運動系の習慣が続かなかった経験は？',
    options: [
      { value: true, label: 'ある' },
      { value: false, label: '特にない' },
    ],
  },
  {
    field: 'goal_focus',
    kind: 'single',
    title: '一番近いのはどれ？',
    options: [
      { value: 'core', label: 'お腹まわりを引き締めたい' },
      { value: 'stamina', label: '体力をつけたい' },
      { value: 'posture', label: '姿勢をよくしたい' },
      { value: 'stress_relief', label: '気分転換・ストレス発散' },
    ],
  },
  {
    field: 'time_per_session_minutes',
    kind: 'single',
    title: '1回にかけられる時間は？',
    options: [
      { value: '5', label: '5分以内' },
      { value: '10', label: '10分程度' },
      { value: '15_20', label: '15-20分' },
      { value: 'flexible', label: 'こだわらない' },
    ],
  },
  {
    field: 'days_per_week',
    kind: 'single',
    title: '週にどのくらいの日数を割けそう？',
    options: [
      { value: '2', label: '週2日' },
      { value: '3_4', label: '週3-4日' },
      { value: '5plus', label: '週5日以上' },
      { value: 'unsure', label: 'わからない' },
    ],
  },
  {
    field: 'equipment_list',
    kind: 'multi',
    title: '使える器具は？',
    hint: '複数選べます',
    exclusiveValue: 'none',
    options: [
      { value: 'none', label: '特になし（自重のみ）' },
      { value: 'mat', label: 'ヨガマット' },
      { value: 'dumbbells', label: 'ダンベル' },
      { value: 'ab_roller', label: '腹筋ローラー' },
      { value: 'resistance_band', label: 'チューブ・レジスタンスバンド' },
      { value: 'other_gym_equipment', label: 'その他（本格的なジム器具など）' },
    ],
  },
  {
    field: 'environment_constraint',
    kind: 'single',
    title: '運動できる環境は？',
    options: [
      { value: 'quiet_small', label: '狭いスペースで静かにやりたい' },
      { value: 'moderate', label: '多少音を立てても大丈夫' },
      { value: 'unrestricted', label: '広さも音も気にしない' },
    ],
  },
  {
    field: 'intensity_preference',
    kind: 'single',
    title: 'きつさの感じ方は？',
    options: [
      { value: 'very_gentle', label: 'ちょっとでもきついと辛い' },
      { value: 'moderate', label: '多少はきつくてもOK' },
      { value: 'challenging', label: '追い込みたい派' },
    ],
  },
  {
    field: 'motivation_style',
    kind: 'single',
    title: '続けるうえで大事にしたいことは？',
    options: [
      { value: 'no_pressure', label: 'とにかく無理しない' },
      { value: 'gradual_change', label: '少しずつでも変化を感じたい' },
      { value: 'achievement', label: '達成感が欲しい' },
    ],
  },
  {
    field: 'target_period_weeks',
    kind: 'single',
    title: '目標までの期間の希望は？',
    options: [
      { value: 4, label: '1ヶ月' },
      { value: 12, label: '3ヶ月' },
      { value: 24, label: '半年' },
      { value: null, label: '特に決めていない' },
    ],
  },
];
