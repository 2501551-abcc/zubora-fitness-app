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
 * 選んだ合計時間(plannedSec = 種目だけの予算)とレベルから、
 * 種目 → 休憩 → 種目 … のセグメント列を組み立てる。
 * 休憩は種目の予算を消費しないため、セグメント全体の長さ（最後の endSec）は
 * plannedSec より休憩ぶんだけ長くなる。
 *
 * 本数はレベル別の目安時間(workSec)に一番近くなるよう先に決め、
 * plannedSec をその本数で均等割りする（例: 1分・ふつう(40秒目安)→ 30秒×2本）。
 * 割り切れない端数は最後の1本にまとめて吸収する。
 *
 * firstExerciseName を渡すと、レベル別ローテーションの代わりに
 * 全ての種目でその名前を使う（目標ロードマップの「今週のタスク」を反映するため）。
 * 最初の1本だけ差し替えてしまうと、同じセッション内で今週のタスクと無関係な
 * ローテーション種目（プランクなど）が混ざって表示され、紛らわしくなるため。
 */
export function buildWorkoutSequence(
  plannedSec: number,
  level: WorkoutLevel,
  firstExerciseName?: string,
): WorkoutSegment[] {
  const { exercises, workSec, restSec } = LEVEL_CONFIG[level];

  const exerciseCount = Math.max(1, Math.round(plannedSec / workSec));
  const baseDur = Math.floor(plannedSec / exerciseCount);
  const remainder = plannedSec - baseDur * exerciseCount;

  const segments: WorkoutSegment[] = [];
  let cursor = 0;
  for (let i = 0; i < exerciseCount; i += 1) {
    // 割り切れない端数（数秒程度）は最後の1本にまとめて吸収する
    const dur = i === exerciseCount - 1 ? baseDur + remainder : baseDur;
    const name = firstExerciseName ?? exercises[i % exercises.length];
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
