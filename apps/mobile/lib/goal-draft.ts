/**
 * 目標作成ウィザードの一時ステート（画面をまたいで回答を持ち回るためのメモリ保持）。
 * create → questions → generating の間だけ使う簡易ストア。
 * 生成が終わったら結果もここに載せて /goal 画面が読み取る。
 */

import type { OptionValue } from '@/constants/goal-questions';
import type {
  DaysPerWeek,
  EnvironmentConstraint,
  Equipment,
  FrequencyLevel,
  GoalFocus,
  IntensityPreference,
  MotivationStyle,
  Roadmap,
  RoadmapInput,
  TimePerSession,
} from '@/types/goal';

let goalText = '';
let answers: Record<string, OptionValue | OptionValue[]> = {};
let lastRoadmap: Roadmap | null = null;

export const goalDraft = {
  setGoalText(text: string) {
    goalText = text;
  },
  getGoalText() {
    return goalText;
  },
  setAnswer(field: string, value: OptionValue | OptionValue[]) {
    answers[field] = value;
  },
  getAnswer(field: string): OptionValue | OptionValue[] | undefined {
    return answers[field];
  },
  setRoadmap(roadmap: Roadmap) {
    lastRoadmap = roadmap;
  },
  getRoadmap() {
    return lastRoadmap;
  },
  reset() {
    goalText = '';
    answers = {};
    lastRoadmap = null;
  },

  /** 回答を AI 入力オブジェクトへ組み立てる（未回答は無難な既定値でフォールバック） */
  toInput(): RoadmapInput {
    return {
      goal_text: goalText.trim(),
      frequency_level: (answers.frequency_level as FrequencyLevel) ?? 'none',
      past_failure_experience: (answers.past_failure_experience as boolean) ?? false,
      goal_focus: (answers.goal_focus as GoalFocus) ?? 'stamina',
      time_per_session_minutes: (answers.time_per_session_minutes as TimePerSession) ?? '10',
      days_per_week: (answers.days_per_week as DaysPerWeek) ?? 'unsure',
      equipment_list: (answers.equipment_list as Equipment[]) ?? ['none'],
      environment_constraint:
        (answers.environment_constraint as EnvironmentConstraint) ?? 'moderate',
      intensity_preference: (answers.intensity_preference as IntensityPreference) ?? 'very_gentle',
      motivation_style: (answers.motivation_style as MotivationStyle) ?? 'no_pressure',
      target_period_weeks: (answers.target_period_weeks as number | null) ?? null,
    };
  },
};
