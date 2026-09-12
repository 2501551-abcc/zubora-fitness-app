// 種目ごとの「お手本」定義。
// 新しい種目を追加するときは、このファイルに設定を1つ足すだけでよい
// （PoseFormEvaluator側のロジックは変更不要）ようにするための構造。
//
// 【左右どちらを向いてもよい設計】
// 以前は「右を向いてください」のように片方の向きを固定で指示していたが、
// カメラのミラーリングの実装によって「実際にどちらを向くと正しく認識されるか」が
// 変わってしまい、実機で何度も食い違いが起きた。
// そこで、向きを固定で指示するのをやめ、左右どちらの関節群がよく見えているかを
// 毎フレーム自動判定し、見えている側をそのまま採点に使う方式に変更した。
// 理想ベクトルとの比較もx座標の絶対値で行うことで、左右どちらの向きでも
// 同じ理想値で判定できるようにしている（詳細はPoseFormEvaluator.ts参照）。

export interface Vector2D {
  x: number;
  y: number;
}

export type JointRole = 'shoulder' | 'hip' | 'knee' | 'ankle' | 'toe';

// 体の片側（左 or 右）を構成する関節のランドマークインデックス一式
export interface SideLandmarks {
  shoulder: number;
  hip: number;
  knee: number;
  ankle: number;
  toe: number;
}

export interface JointVectorDef {
  id: string;
  from: JointRole;
  to: JointRole;
  // 理想ベクトル。xは非負の値にしておく（実際の値は絶対値で比較するため、
  // 左向き/右向きのどちらでも同じ値をそのまま使える）
  ideal: Vector2D;
}

export interface DepthAngleRange {
  tooShallowAbove: number;
  tooDeepBelow: number;
}

export interface KneeOverToeCheckDef {
  maxForwardRatio: number;
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

  sideLandmarks: { left: SideLandmarks; right: SideLandmarks };
  // 左右の見えやすさの差がこれ未満だと「どちらの側か判別できない」とみなす
  minVisibilityMargin: number;
  // 左右どちらかに明確に体を向けてもらうための案内（方向は指定しない）
  noSideInstructionText: string;

  depthRole: JointRole; // 深さ判定に使う関節（通常は 'hip'）
  standingYThreshold: number;
  startDelta: number; // これを超えたら「動作開始（かもしれない）」とみなす
  minRepDepthDelta: number; // これ以上深く沈まないと「1回」とカウントしない
  riseDelta: number; // 最深部からこれだけ戻ったら「1回完了」の判定タイミング
  cooldownMs: number;

  joints: JointVectorDef[];
  angleCheck: { hip: JointRole; knee: JointRole; ankle: JointRole };
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
const THIGH_MIN_SIM = 0.2;
const KNEE_TOO_SHALLOW_ABOVE = 120;
const KNEE_TOO_DEEP_BELOW = 35;
const KNEE_FORWARD_MAX_RATIO = 0.25;
// 太ももが「まだ立ちすぎている」と判断する角度(床からの角度、度)。
// これより大きい(＝床と平行から遠い)場合は「もっと深く」系のアドバイスにする。
const THIGH_TOO_STEEP_ABOVE_DEG = 62;

// MediaPipe Pose（33点）の主要インデックス
// 11: 左肩, 23: 左腰, 25: 左膝, 27: 左足首, 31: 左つま先
// 12: 右肩, 24: 右腰, 26: 右膝, 28: 右足首, 32: 右つま先
export const SQUAT_CONFIG: ExerciseConfig = {
  id: 'squat',
  displayName: 'スクワット',

  sideLandmarks: {
    left: { shoulder: 11, hip: 23, knee: 25, ankle: 27, toe: 31 },
    right: { shoulder: 12, hip: 24, knee: 26, ankle: 28, toe: 32 },
  },
  minVisibilityMargin: 0.15,
  noSideInstructionText: '体を横向きにして、全身をカメラに映してください',

  depthRole: 'hip',
  standingYThreshold: 0.4,
  startDelta: 0.1,
  minRepDepthDelta: 0.15,
  riseDelta: 0.03,
  cooldownMs: 800,

  joints: [
    { id: 'torso', from: 'hip', to: 'shoulder', ideal: { x: 0.0, y: -1.0 } },
    { id: 'thigh', from: 'hip', to: 'knee', ideal: { x: 0.707, y: 0.707 } },
    { id: 'shin', from: 'knee', to: 'ankle', ideal: { x: 0.0, y: 1.0 } },
  ],
  angleCheck: { hip: 'hip', knee: 'knee', ankle: 'ankle' },
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
    maxForwardRatio: KNEE_FORWARD_MAX_RATIO,
  },

  // 優先順位: 深さ(浅い/深すぎ) → 膝の前方超過 → 上半身の傾き → 太もも → OK
  getAdvice: ({ kneeAngle, jointSimilarities, jointAngles, kneeForwardRatio }) => {
    if (kneeAngle > KNEE_TOO_SHALLOW_ABOVE) return 'もう少し深めに腰を落としましょう！';
    if (kneeAngle < KNEE_TOO_DEEP_BELOW) return '腰の落としすぎです！膝に注意してください。';
    if (kneeForwardRatio > KNEE_FORWARD_MAX_RATIO)
      return '膝がつま先より前に出すぎています。お尻を後ろに引くイメージで。';
    if (jointSimilarities.torso < TORSO_MIN_SIM)
      return '上半身が前に傾きすぎています。胸を張りましょう。';
    if (jointSimilarities.thigh < THIGH_MIN_SIM) {
      if (jointAngles.thigh > THIGH_TOO_STEEP_ABOVE_DEG) {
        return 'もう少し深く、太ももが床と並行になるように意識しましょう。';
      }
      return '太ももの向きが理想と少しずれています。膝が左右にブレないよう意識しましょう。';
    }
    return SQUAT_PRAISE_TEXT;
  },
  praiseText: SQUAT_PRAISE_TEXT,
  targetGoodReps: 10,
  completionText: 'お疲れさまでした',
};

export const EXERCISE_CONFIGS: Record<string, ExerciseConfig> = {
  squat: SQUAT_CONFIG,
};
