/**
 * 目標ロードマップのデータ層
 * =====================================================================
 * UI（app/goal/*）はこのファイルの関数シグネチャだけに依存しています。
 *
 * generateRoadmap()  … 前提10問 + 大目標 → Gemini で目標ツリーを一括生成
 *   - 設計: docs/goal-roadmap-design.md
 *   - キー(EXPO_PUBLIC_GEMINI_API_KEY)が無いときはモックのツリーを返す（開発用）
 *   - 生成失敗は throw（generating.tsx がリトライ UI を出す）
 *
 * saveRoadmap() / fetchCurrentRoadmap() … 「この目標ではじめる」で確定したロードマップの保存/取得
 *   - Supabase RPC（save_roadmap / get_current_roadmap）で永続化。
 *     docs/goal-roadmap-persistence-spec.md 通りの契約（goal_trees/milestones/tasks, RLS で本人のみ）。
 *     端末をまたいでも同じロードマップが見える。
 *   - 未ログインだと RPC が AUTH_REQUIRED を投げる（saveRoadmap は throw、
 *     fetchCurrentRoadmap は catch して null＝「まだ目標なし」表示にする）。
 *
 * fetchThisWeekFocus() … ホーム画面用。保存済みロードマップの「今週やるタスク」を1件返す
 *   - RPC: get_this_week_focus（現在週 = goal_trees.created_at からの経過週）
 * =====================================================================
 */

import { buildRoadmapPrompt } from '@/lib/goal-prompt';
import { callGeminiForRoadmap } from '@/lib/gemini-roadmap';
import { normalizeRoadmap } from '@/lib/normalize-roadmap';
import { supabase } from '@/supabase';
import type { Roadmap, RoadmapInput, WeekFocus } from '@/types/goal';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() ?? '';

/**
 * 前提入力から目標ツリーを生成する。
 * キーが設定されていれば Gemini、なければモック。
 */
export async function generateRoadmap(input: RoadmapInput): Promise<Roadmap> {
  if (!GEMINI_API_KEY) {
    console.warn('[goalService] EXPO_PUBLIC_GEMINI_API_KEY 未設定。モックのロードマップを返します。');
    await delay(1200);
    return buildMockRoadmap(input);
  }

  const prompt = buildRoadmapPrompt(input);
  // スキーマ不一致・JSON 破損は 1 回だけ自動リトライ（設計 §7）
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await callGeminiForRoadmap(prompt, GEMINI_API_KEY);
      return normalizeRoadmap(raw, input);
    } catch (e) {
      lastErr = e;
      const kind = (e as { kind?: string })?.kind;
      // ネットワーク/HTTP/ブロックは即 throw（リトライしても無駄 or 課金増）
      if (kind === 'network' || kind === 'http' || kind === 'blocked') break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('ロードマップ生成に失敗しました');
}

/**
 * 「この目標ではじめる」で確定したロードマップを保存する。
 * 呼び出しユーザーの既存ロードマップは非アクティブ化され、この内容が新しい「現在の目標」になる。
 * 未ログインだと AUTH_REQUIRED で reject するので、呼び出し側でログイン導線を出すこと。
 */
export async function saveRoadmap(roadmap: Roadmap): Promise<void> {
  const { error } = await supabase.rpc('save_roadmap', { p_roadmap: roadmap });
  if (error) throw error;
}

/**
 * 保存済みのロードマップを取得する（目標画面の初期表示用）。
 * 未保存 / 未ログイン / 取得失敗なら null（"まだ目標がありません" 表示になる）。
 */
export async function fetchCurrentRoadmap(): Promise<Roadmap | null> {
  try {
    const { data, error } = await supabase.rpc('get_current_roadmap');
    if (error) throw error;
    return (data as Roadmap | null) ?? null;
  } catch (err) {
    console.warn('[goalService] 保存済みロードマップの取得に失敗しました:', err);
    return null;
  }
}

/**
 * ホーム画面用「今週の目標」を取得する。
 * ロードマップ未保存 / 未ログイン / 取得失敗なら null（ホーム側は非表示にする）。
 */
export async function fetchThisWeekFocus(): Promise<WeekFocus | null> {
  try {
    const { data, error } = await supabase.rpc('get_this_week_focus');
    if (error) throw error;
    if (!data) return null;
    const row = data as {
      roadmap_title: string;
      current_week: number;
      target_period_weeks: number;
      is_complete: boolean;
      milestone_title: string | null;
      task_title: string | null;
      task_description: string | null;
      frequency_per_week: number | null;
      workout_menu_tag?: string | null;
    };
    return {
      roadmapTitle: row.roadmap_title,
      currentWeek: row.current_week,
      targetPeriodWeeks: row.target_period_weeks,
      isComplete: row.is_complete,
      milestoneTitle: row.milestone_title,
      taskTitle: row.task_title,
      taskDescription: row.task_description,
      frequencyPerWeek: row.frequency_per_week,
      workoutMenuTag: row.workout_menu_tag ?? null,
    };
  } catch (err) {
    console.warn('[goalService] 今週の目標の取得に失敗しました:', err);
    return null;
  }
}

/* ---------- 以下はスタブ用のダミー生成（バックエンド実装時は不要） ---------- */

function buildMockRoadmap(input: Partial<RoadmapInput>): Roadmap {
  const weeks = input.target_period_weeks ?? 12;
  const raw = input.goal_text ?? '無理なく体を動かしたい';
  return {
    goal_id: 'mock-goal-1',
    title: 'お腹まわりを引き締める12週間プラン',
    user_input_raw: raw,
    target_period_weeks: weeks,
    milestones: [
      {
        milestone_id: 'm1',
        order: 1,
        title: '体を動かす習慣をつくる',
        period_weeks: 5,
        description:
          'まずは週2回、10分以内の静かにできるメニューから。無理のないペースに調整しました。',
        tasks: [
          {
            task_id: 't1',
            order: 1,
            week_number: 1,
            title: '基本の体幹メニューに慣れる',
            description: '静かにできる基本メニューから始めます。',
            frequency_per_week: 2,
            workout_menu_tag: 'core_basic_quiet',
          },
        ],
      },
      {
        milestone_id: 'm2',
        order: 2,
        title: '少しずつ負荷を上げる',
        period_weeks: 4,
        description: '慣れてきたら回数を週3回へ。腹筋ローラーも取り入れます。',
        tasks: [],
      },
      {
        milestone_id: 'm3',
        order: 3,
        title: '仕上げの3週間',
        period_weeks: 3,
        description: 'ここまで続けられたら十分です。最後はテンポよく整えます。',
        tasks: [],
      },
    ],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
