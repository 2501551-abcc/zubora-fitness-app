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
 *   - TODO(persist): goal_trees/milestones/tasks テーブル実装後、この2関数の中身だけ
 *     Supabase RPC（save_roadmap / get_current_roadmap, docs/goal-roadmap-persistence-spec.md）
 *     に差し替える。シグネチャは変えない。
 *   - 現状は端末内 AsyncStorage に保存（複数端末間では共有されない暫定実装）
 * =====================================================================
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { buildRoadmapPrompt } from '@/lib/goal-prompt';
import { callGeminiForRoadmap } from '@/lib/gemini-roadmap';
import { normalizeRoadmap } from '@/lib/normalize-roadmap';
import type { Roadmap, RoadmapInput } from '@/types/goal';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() ?? '';
const ROADMAP_STORAGE_KEY = 'zubora:goal:current-roadmap';

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
 * TODO(persist): Supabase 実装後は supabase.rpc('save_roadmap', { p_roadmap: roadmap }) に差し替え。
 */
export async function saveRoadmap(roadmap: Roadmap): Promise<void> {
  await AsyncStorage.setItem(ROADMAP_STORAGE_KEY, JSON.stringify(roadmap));
}

/**
 * 保存済みのロードマップを取得する（目標画面の初期表示用）。
 * 未保存なら null（"まだ目標がありません" 表示になる）。
 * TODO(persist): Supabase 実装後は supabase.rpc('get_current_roadmap') に差し替え。
 */
export async function fetchCurrentRoadmap(): Promise<Roadmap | null> {
  try {
    const raw = await AsyncStorage.getItem(ROADMAP_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Roadmap) : null;
  } catch (err) {
    console.warn('[goalService] 保存済みロードマップの読み込みに失敗しました:', err);
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
