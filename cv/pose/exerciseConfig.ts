// 種目ごとの「お手本」定義。
// 新しい種目を追加するときは、このファイルに設定を1つ足すだけでよい
// （PoseFormEvaluator側のロジックは変更不要）ようにするための構造。
//
// 【向きについて】
// 左右自動判定も試したが、実機での安定性を優先して「右を向く」固定に戻した。
// （立ち位置の自動キャリブレーションなど、他の改善は維持している）

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

export interface DirectionCheckDef {
  facingSideIndices: number[];
  awaySideIndices: number[];
  minVisibilityMargin: number;
  instructionText: string;
}

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
  // 各関節ベクトルの「床(水平)からの角度」(度)。0°=水平、90°=垂直。
  jointAngles: Record<string, number>;
  kneeForwardRatio: number;
}

export interface ExerciseConfig {
  id: string;
  displayName: string;

  visibilityCheckpoints: number[];
  directionCheck: DirectionCheckDef;

  depthLandmarkIdx: number;
  standingYThreshold: number; // 較正前の初期フォールバック値としてのみ使用
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
const TORSO_MIN_SIM = 0.25;
// const THIGH_MIN_SIM = 0.1; // 太ももの向きチェックは廃止（下記参照）
const KNEE_TOO_SHALLOW_ABOVE = 140;
const KNEE_TOO_DEEP_BELOW = 30;
const KNEE_FORWARD_MAX_RATIO = 0.25;
// 太ももが「まだ立ちすぎている」と判断する角度(床からの角度、度)。
// これより大きい(＝床と平行から遠い)場合は「もっと深く」系のアドバイスにする。
// const THIGH_TOO_STEEP_ABOVE_DEG = 68; // 太ももの向きチェックは廃止（下記参照）

// MediaPipe Pose（33点）の主要インデックス
// 12: 右肩, 24: 右腰, 26: 右膝, 28: 右足首, 32: 右つま先（＝カメラに向く側）
// 11: 左肩, 23: 左腰, 25: 左膝, 27: 左足首（＝奥側。向き判定の比較にのみ使用）
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

  depthLandmarkIdx: 24,
  standingYThreshold: 0.4,
  startDelta: 0.1,
  minRepDepthDelta: 0.15,
  riseDelta: 0.03,
  cooldownMs: 800,

  joints: [
    { id: 'torso', fromIdx: 24, toIdx: 12, ideal: { x: 0.0, y: -1.0 } },
    // thigh: スコア計算からも除外（アドバイス判定に続き、ここでも点数を下げる要因になっていたため）
    { id: 'shin', fromIdx: 26, toIdx: 28, ideal: { x: 0.0, y: 1.0 } },
  ],
  angleCheck: { hipIdx: 24, kneeIdx: 26, ankleIdx: 28 },
  depthAngleRange: {
    tooShallowAbove: KNEE_TOO_SHALLOW_ABOVE,
    tooDeepBelow: KNEE_TOO_DEEP_BELOW,
  },

  jointThresholds: {
    torso: TORSO_MIN_SIM,
    // thigh: 向きチェックは廃止（頻繁に引っかかっていたため。スコア計算には引き続き使用）
  },

  kneeOverToeCheck: {
    kneeIdx: 26,
    toeIdx: 32,
    scaleFromIdx: 26,
    scaleToIdx: 28,
    maxForwardRatio: KNEE_FORWARD_MAX_RATIO,
  },

  // 優先順位: 深さ(浅い/深すぎ) → 膝の前方超過 → 上半身の傾き → OK
  // ※太もも単体の向きチェックは廃止（頻繁に引っかかり、スコアが上がりにくかったため）
  getAdvice: ({ kneeAngle, jointSimilarities, kneeForwardRatio }) => {
    if (kneeAngle > KNEE_TOO_SHALLOW_ABOVE) return 'もう少し深めに腰を落としましょう！';
    if (kneeAngle < KNEE_TOO_DEEP_BELOW) return '腰の落としすぎです！膝に注意してください。';
    if (kneeForwardRatio > KNEE_FORWARD_MAX_RATIO)
      return '膝がつま先より前に出すぎています。お尻を後ろに引くイメージで。';
    if (jointSimilarities.torso < TORSO_MIN_SIM)
      return '上半身が前に傾きすぎています。胸を張りましょう。';
    return SQUAT_PRAISE_TEXT;
  },
  praiseText: SQUAT_PRAISE_TEXT,
  targetGoodReps: 10,
  completionText: 'お疲れさまでした',
};

export const EXERCISE_CONFIGS: Record<string, ExerciseConfig> = {
  squat: SQUAT_CONFIG,
};
