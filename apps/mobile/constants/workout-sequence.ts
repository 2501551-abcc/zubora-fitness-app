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
 * 新しいセグメントを開始する価値があるとみなす最低ライン（本来の長さに対する割合）。
 * これを下回る中途半端な種目/休憩は追加せず、直前のセグメントを延長して埋める。
 */
const MIN_SEGMENT_FRACTION = 0.4;

/**
 * 選んだ合計時間(plannedSec)とレベルから、種目 → 休憩 → 種目 … のセグメント列を
 * 組み立てる。最後に半端な時間（本来の長さの40%未満）しか残らない場合は、
 * その種目/休憩を追加せず直前のセグメントを plannedSec まで延長する
 * （例: 1分選択時に「スクワット40秒 + 休憩15秒」のあと5秒だけ次の種目、
 * という中途半端な状態を避け、休憩を20秒に延ばして丁度埋める）。
 */
export function buildWorkoutSequence(plannedSec: number, level: WorkoutLevel): WorkoutSegment[] {
  const { exercises, workSec, restSec } = LEVEL_CONFIG[level];
  const segments: WorkoutSegment[] = [];
  let elapsed = 0;
  let exerciseIndex = 0;

  while (elapsed < plannedSec) {
    const isRest = segments.length % 2 === 1; // 種目 → 休憩 → 種目 … の交互
    const duration = isRest ? restSec : workSec;
    const remaining = plannedSec - elapsed;

    if (remaining < duration * MIN_SEGMENT_FRACTION) {
      if (segments.length === 0) {
        // そもそも1つもセグメントが無い（plannedSec 自体が極端に短い）場合は、
        // 延長する相手が無いので種目だけの短いセグメントを作る。
        segments.push({
          type: 'exercise',
          name: exercises[0],
          startSec: elapsed,
          endSec: plannedSec,
        });
      } else {
        // 直前のセグメント（休憩 or 種目）を延長して、半端な追加をしない。
        segments[segments.length - 1].endSec = plannedSec;
      }
      break;
    }

    const name = isRest ? '休憩' : exercises[exerciseIndex % exercises.length];
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
