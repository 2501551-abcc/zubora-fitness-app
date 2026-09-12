/**
 * 筋トレ画面（session.tsx）で「今やってる種目」と「休憩」を作るための簡易メニュー定義。
 * ロードマップの workout_menu_tag（22種、AI生成用）とは別軸——こちらは通常の
 * 「筋トレを始める」フロー（時間 + 強度だけ選ぶ）向けに、レベルごとの種目を
 * ローテーションさせて休憩を挟んだセグメント列を作る。
 *
 * 選んだ合計時間（plannedSec）は「種目（実際に動く時間）」の予算であり、
 * 休憩はその予算を消費しない＝実際にかかる時間は plannedSec + 休憩の合計。
 * （session.tsx 側で「筋トレの残り」は休憩中は減らないようにしている）
 */
import type { WorkoutLevel } from '@/types/workout';

export interface WorkoutSegment {
  type: 'exercise' | 'rest';
  /** 表示名（休憩は「休憩」固定） */
  name: string;
  /** セッション開始からのオフセット（秒）。休憩も含む実時間の座標。 */
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
 * 最後の1本が本来の長さに対してこの割合未満しかない場合は追加せず、
 * 1本減らしてその分を最後の種目に吸収させる（中途半端な短い種目を避ける）。
 */
const MIN_SEGMENT_FRACTION = 0.4;

/**
 * 選んだ合計時間(plannedSec = 種目だけの予算)とレベルから、
 * 種目 → 休憩 → 種目 … のセグメント列を組み立てる。
 * 休憩は種目の予算を消費しないため、セグメント全体の長さ（最後の endSec）は
 * plannedSec より休憩ぶんだけ長くなる。
 *
 * firstExerciseName を渡すと、最初の1本だけレベル別ローテーションの代わりに
 * その名前を使う（目標ロードマップの「今週のタスク」を反映するため）。
 */
export function buildWorkoutSequence(
  plannedSec: number,
  level: WorkoutLevel,
  firstExerciseName?: string,
): WorkoutSegment[] {
  const { exercises, workSec, restSec } = LEVEL_CONFIG[level];

  let exerciseCount = Math.max(1, Math.ceil(plannedSec / workSec));
  let lastDur = plannedSec - (exerciseCount - 1) * workSec;
  if (lastDur < workSec * MIN_SEGMENT_FRACTION && exerciseCount > 1) {
    // 最後の1本が短すぎる → 1本減らして、その分を新しい最後の1本に吸収させる
    exerciseCount -= 1;
    lastDur = plannedSec - (exerciseCount - 1) * workSec;
  }

  const segments: WorkoutSegment[] = [];
  let cursor = 0;
  for (let i = 0; i < exerciseCount; i += 1) {
    const dur = i === exerciseCount - 1 ? lastDur : workSec;
    const name = i === 0 && firstExerciseName ? firstExerciseName : exercises[i % exercises.length];
    segments.push({ type: 'exercise', name, startSec: cursor, endSec: cursor + dur });
    cursor += dur;

    if (i < exerciseCount - 1) {
      segments.push({ type: 'rest', name: '休憩', startSec: cursor, endSec: cursor + restSec });
      cursor += restSec;
    }
  }

  return segments;
}

/** 経過秒数（休憩込みの実時間）から、今どのセグメントにいるかを返す。 */
export function findSegmentAt(segments: WorkoutSegment[], elapsedSec: number): WorkoutSegment {
  return (
    segments.find((s) => elapsedSec >= s.startSec && elapsedSec < s.endSec) ??
    segments[segments.length - 1]
  );
}

/**
 * 実時間の経過（休憩込み）から、「種目だけ」の消化量を出す。
 * 休憩中はこの値が増えない＝「筋トレの残り時間」を止めるための計算。
 */
export function exerciseElapsedAt(segments: WorkoutSegment[], elapsedSec: number): number {
  return segments.reduce((sum, s) => {
    if (s.type !== 'exercise') return sum;
    const dur = s.endSec - s.startSec;
    return sum + Math.max(0, Math.min(dur, elapsedSec - s.startSec));
  }, 0);
}
