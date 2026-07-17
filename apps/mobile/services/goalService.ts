/**
 * 目標ロードマップのデータ層（バックエンド接合部）
 * =====================================================================
 * ★バックエンド担当へ★
 * UI はこのファイルの関数シグネチャだけに依存しています。
 * 現状はスタブ（モックのツリーを返す）ので、フロント単体で通しで動きます。
 *
 * generateRoadmap() の中身を Gemini 呼び出しに差し替えれば結合完了です。
 *   - 設計ドラフト セクション5 のシステムプロンプトを使用。
 *   - ★重要★ Gemini API は response_mime_type だけでなく、必ず
 *     response_schema（types/goal.ts の Roadmap 構造）を明示的に渡すこと。
 *     指定しないと JSON が壊れるケースが実検証で確認されています。
 *   - 採用モデル：gemini-3.5-flash（レイテンシ約30秒。UI側は生成中画面で吸収）。
 * =====================================================================
 */

import type { Roadmap, RoadmapInput } from '@/types/goal';

/**
 * 前提入力から目標ツリーを生成する。
 * TODO(backend): ここを Gemini API 呼び出しに差し替える。
 *   1. 設計ドラフト セクション5 のシステムプロンプトに入力を差し込む
 *   2. response_schema に Roadmap 構造を渡して構造化出力を強制
 *   3. 返ってきた JSON をそのまま Roadmap として返す
 * 現状は入力に応じてそれっぽいモックを返す（約1.2秒の疑似待ち付き）。
 */
export async function generateRoadmap(input: RoadmapInput): Promise<Roadmap> {
  await delay(1200); // 生成中画面の確認用のダミー待ち（本番は約30秒）
  return buildMockRoadmap(input);
}

/**
 * 保存済みのロードマップを取得する（目標画面の初期表示用）。
 * TODO(backend): Supabase 等から現在のツリーを取得。未作成なら null。
 * 現状はデモ用のモックを返す。
 */
export async function fetchCurrentRoadmap(): Promise<Roadmap | null> {
  await delay(300);
  return buildMockRoadmap({
    goal_text: '3ヶ月で腹筋を割りたい',
    target_period_weeks: 12,
  } as RoadmapInput);
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
