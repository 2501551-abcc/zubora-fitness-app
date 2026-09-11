/**
 * 筋トレ画面（session.tsx）で「今やってる種目」と「休憩」を作るための簡易メニュー定義。
 * ロードマップの workout_menu_tag（22種、AI生成用）とは別軸——こちらは通常の
 * 「筋トレを始める」フロー（時間 + 強度だけ選ぶ）向けに、レベルごとの種目を
 * ローテーションさせて休憩を挟んだセグメント列を作る。
 */
import type { WorkoutLevel } from '@/types/workout';

export interface WorkoutSegment {
  type: 'exercise' | 'rest';
  /** 表示名（休憩は「休憩」固定） */
  name: string;
  /** セッション開始からのオフセット（秒） */
  startSec: number;
  /** 同上、終了オフセット（秒） */
  endSec: number;
}

interface LevelConfig {
  exercises: string[];
  workSec: number;
  restSec: number;
}

const LEVEL_CONFIG: Record<WorkoutLevel, LevelConfig> = {
  easy: {
    exercises: ['肩甲骨ほぐし', '座ったまま脚上げ', '首まわし', '深呼吸ストレッチ'],
    workSec: 30,
    restSec: 20,
  },
  normal: {
    exercises: ['スクワット', 'もも上げ', 'プランク', 'サイドステップ', 'かかと上げ'],
    workSec: 40,
    restSec: 15,
  },
  hard: {
    exercises: [
      'バーピー',
      'ジャンピングジャック',
      'プッシュアップ',
      'マウンテンクライマー',
      'スクワットジャンプ',
    ],
    workSec: 45,
    restSec: 10,
  },
};

/**
 * 選んだ合計時間(plannedSec)とレベルから、種目 → 休憩 → 種目 … のセグメント列を
 * 組み立てる。最後のセグメントは合計が plannedSec ぴったりになるよう切り詰める。
 * 種目は1つだけでも成立するように、休憩なしの短いセッション（1分未満相当）にも対応。
 */
export function buildWorkoutSequence(plannedSec: number, level: WorkoutLevel): WorkoutSegment[] {
  const { exercises, workSec, restSec } = LEVEL_CONFIG[level];
  const segments: WorkoutSegment[] = [];
  let elapsed = 0;
  let exerciseIndex = 0;

  while (elapsed < plannedSec) {
    const isRest = segments.length % 2 === 1; // 種目 → 休憩 → 種目 … の交互
    const name = isRest ? '休憩' : exercises[exerciseIndex % exercises.length];
    const duration = isRest ? restSec : workSec;
    const endSec = Math.min(plannedSec, elapsed + duration);

    segments.push({ type: isRest ? 'rest' : 'exercise', name, startSec: elapsed, endSec });

    if (!isRest) exerciseIndex += 1;
    elapsed = endSec;
  }

  return segments;
}

/** 経過秒数から、今どのセグメントにいるかを返す。 */
export function findSegmentAt(segments: WorkoutSegment[], elapsedSec: number): WorkoutSegment {
  return (
    segments.find((s) => elapsedSec >= s.startSec && elapsedSec < s.endSec) ??
    segments[segments.length - 1]
  );
}
