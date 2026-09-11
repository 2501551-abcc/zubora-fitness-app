// 種目ごとの「お手本」定義。
// 新しい種目を追加するときは、このファイルに設定を1つ足すだけでよい
// （PoseFormEvaluator側のロジックは変更不要）ようにするための構造。

export interface Vector2D {
  x: number;
  y: number;
}

export interface JointVectorDef {
  id: string;
  fromIdx: number;
  toIdx: number;
  ideal: Vector2D;
}

// 「正しい向きでカメラに構えているか」の判定に使う設定
export interface DirectionCheckDef {
  facingSideIndices: number[];
  awaySideIndices: number[];
  minVisibilityMargin: number;
  instructionText: string;
}

// 膝がつま先より前に出過ぎていないかのチェック
export interface KneeOverToeCheckDef {
  kneeIdx: number;
  toeIdx: number;
  scaleFromIdx: number;
  scaleToIdx: number;
  maxForwardRatio: number;
}

export interface DepthAngleRange {
  tooShallowAbove: number;
  tooDeepBelow: number;
}

export interface AdviceInput {
  kneeAngle: number;
  jointSimilarities: Record<string, number>;
  kneeForwardRatio: number;
}

export interface ExerciseConfig {
  id: string;
  displayName: string;

  visibilityCheckpoints: number[];
  directionCheck: DirectionCheckDef;

  depthLandmarkIdx: number;
  standingYThreshold: number;
  startDelta: number; // これを超えたら「動作開始（かもしれない）」とみなす
  minRepDepthDelta: number; // これ以上深く沈まないと「1回」とカウントしない
  riseDelta: number; // 最深部からこれだけ戻ったら「1回完了」の判定タイミング
  cooldownMs: number;

  joints: JointVectorDef[];
  angleCheck: { hipIdx: number; kneeIdx: number; ankleIdx: number };
  depthAngleRange: DepthAngleRange;

  jointThresholds: Record<string, number>;
  kneeOverToeCheck: KneeOverToeCheckDef;

  getAdvice: (input: AdviceInput) => string;

  praiseText: string;
  targetGoodReps: number;
  completionText: string;
}

const SQUAT_PRAISE_TEXT = '素晴らしいフォームです！';

// --- 判定の厳しさはここで一括管理する ---
const TORSO_MIN_SIM = 0.5;
const THIGH_MIN_SIM = 0.4;
const KNEE_TOO_SHALLOW_ABOVE = 90;
const KNEE_TOO_DEEP_BELOW = 55;
const KNEE_FORWARD_MAX_RATIO = 0.25;

// MediaPipe Pose（33点）の主要インデックス
// 11: 左肩, 23: 左腰, 25: 左膝, 27: 左足首（＝奥側になる想定）
// 12: 右肩, 24: 右腰, 26: 右膝, 28: 右足首, 31/32: つま先（＝カメラに向く側の想定）
export const SQUAT_CONFIG: ExerciseConfig = {
  id: 'squat',
  displayName: 'スクワット',

  visibilityCheckpoints: [12, 28],

  directionCheck: {
    facingSideIndices: [12, 24, 26, 28],
    awaySideIndices: [11, 23, 25, 27],
    minVisibilityMargin: 0.15,
    instructionText: '右を向いてください',
  },

  depthLandmarkIdx: 23,
  standingYThreshold: 0.4,
  startDelta: 0.1,
  minRepDepthDelta: 0.15,
  riseDelta: 0.03,
  cooldownMs: 800,

  joints: [
    { id: 'torso', fromIdx: 23, toIdx: 11, ideal: { x: 0.0, y: -1.0 } },
    { id: 'thigh', fromIdx: 23, toIdx: 25, ideal: { x: 0.707, y: 0.707 } },
    { id: 'shin', fromIdx: 25, toIdx: 27, ideal: { x: 0.0, y: 1.0 } },
  ],
  angleCheck: { hipIdx: 23, kneeIdx: 25, ankleIdx: 27 },
  depthAngleRange: {
    tooShallowAbove: KNEE_TOO_SHALLOW_ABOVE,
    tooDeepBelow: KNEE_TOO_DEEP_BELOW,
  },

  jointThresholds: {
    torso: TORSO_MIN_SIM,
    thigh: THIGH_MIN_SIM,
    // shin: 個別の垂直性チェックは廃止（kneeOverToeCheckに一本化したため）
  },

  kneeOverToeCheck: {
    kneeIdx: 25,
    toeIdx: 31,
    scaleFromIdx: 25,
    scaleToIdx: 27,
    maxForwardRatio: KNEE_FORWARD_MAX_RATIO,
  },

  // 優先順位: 深さ(浅い/深すぎ) → 膝の前方超過 → 上半身の傾き → 太もも → OK
  getAdvice: ({ kneeAngle, jointSimilarities, kneeForwardRatio }) => {
    if (kneeAngle > KNEE_TOO_SHALLOW_ABOVE) return 'もう少し深めに腰を落としましょう！';
    if (kneeAngle < KNEE_TOO_DEEP_BELOW) return '腰の落としすぎです！膝に注意してください。';
    if (kneeForwardRatio > KNEE_FORWARD_MAX_RATIO)
      return '膝がつま先より前に出すぎています。お尻を後ろに引くイメージで。';
    if (jointSimilarities.torso < TORSO_MIN_SIM)
      return '上半身が前に傾きすぎています。胸を張りましょう。';
    if (jointSimilarities.thigh < THIGH_MIN_SIM)
      return '太ももの角度が理想と少しずれています。';
    return SQUAT_PRAISE_TEXT;
  },
  praiseText: SQUAT_PRAISE_TEXT,
  targetGoodReps: 10,
  completionText: 'お疲れさまでした',
};

export const EXERCISE_CONFIGS: Record<string, ExerciseConfig> = {
  squat: SQUAT_CONFIG,
};
