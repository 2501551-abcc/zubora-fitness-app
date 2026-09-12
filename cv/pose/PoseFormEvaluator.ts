import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

// Web環境でエラーになるのを防ぐためのダミー（モック）ラッパー
const safeSpeech = {
  speak: (text: string, options?: any) => {
    if (Platform.OS === 'web') {
      // ブラウザ環境ではコンソールに出力（必要ならブラウザ標準の音声合成を使用）
      console.log('[Voice Feedback]:', text);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const uttr = new SpeechSynthesisUtterance(text);
        uttr.lang = 'ja-JP';
        window.speechSynthesis.speak(uttr);
      }
    } else {
      Speech.speak(text, options);
    }
  },
  stop: () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } else {
      Speech.stop();
    }
  },
};

import { ExerciseConfig, SideLandmarks, Vector2D } from './exerciseConfig';

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface RepLog {
  repNumber: number;
  score: number;
  advice: string;
  isGoodForm: boolean;
}

export interface FrameResult {
  score?: number;
  advice: string;
  isReady: boolean;
  countIncrement?: boolean;
  sessionFinished?: boolean;
  sessionLog?: RepLog[];
}

type Phase = 'init' | 'checking_visibility' | 'checking_direction' | 'ready' | 'finished';
type Side = 'left' | 'right';

const SMOOTHING_ALPHA = 0.4;
const NG_SCORE_CAP = 80;

export class PoseFormEvaluator {
  private config: ExerciseConfig;
  private phase: Phase = 'init';
  private isMoving = false;
  private deepestY = 0.0;
  private lastRepAt = 0;
  private smoothed: Landmark[] = [];

  // 左右どちらの側を採点に使っているか。'ready'になるまでは毎フレーム判定し、
  // 一度readyになったら次にフレームアウトするまで固定する（途中でブレないように）
  private activeSide: Side | null = null;

  // 一度READYになった後、完全にフレームアウトするまでは
  // 「全身を確認しました」を再度読み上げない
  private hasAnnouncedReady = false;

  // 話している最中は次のspeakAdviceを無視する（喋りの途中で切り替わるのを防ぐ）
  private isSpeaking = false;

  private repLog: RepLog[] = [];
  private goodRepCount = 0;

  constructor(config: ExerciseConfig) {
    this.config = config;
  }

  private smoothLandmarks(raw: Landmark[]): Landmark[] {
    if (this.smoothed.length !== raw.length) {
      this.smoothed = raw.map((l) => ({ ...l }));
      return this.smoothed;
    }
    this.smoothed = raw.map((l, i) => {
      const prev = this.smoothed[i];
      return {
        x: prev.x + SMOOTHING_ALPHA * (l.x - prev.x),
        y: prev.y + SMOOTHING_ALPHA * (l.y - prev.y),
        visibility: l.visibility,
      };
    });
    return this.smoothed;
  }

  private cosineSimilarity(v1: Vector2D, v2: Vector2D): number {
    const dot = v1.x * v2.x + v1.y * v2.y;
    const n1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const n2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (n1 === 0 || n2 === 0) return 0;
    return dot / (n1 * n2);
  }

  // 左右どちらの向きでも同じ理想ベクトルで比較できるよう、xは絶対値にしてから比較する
  private directionAgnosticSimilarity(v: Vector2D, ideal: Vector2D): number {
    return this.cosineSimilarity({ x: Math.abs(v.x), y: v.y }, ideal);
  }

  private calculateAngle(hip: Landmark, knee: Landmark, ankle: Landmark): number {
    const v1 = { x: hip.x - knee.x, y: hip.y - knee.y };
    const v2 = { x: ankle.x - knee.x, y: ankle.y - knee.y };
    const sim = Math.max(-1, Math.min(1, this.cosineSimilarity(v1, v2)));
    return Math.acos(sim) * (180 / Math.PI);
  }

  private avgVisibility(landmarks: Landmark[], indices: number[]): number {
    const values = indices.map((i) => landmarks[i]?.visibility ?? 0);
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private distance(a: Landmark, b: Landmark): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private sideIndices(side: SideLandmarks): number[] {
    return [side.shoulder, side.hip, side.knee, side.ankle, side.toe];
  }

  /**
   * 目標回数に関係なく、いつでも自分でセッションを終了できるようにするための
   * 手動終了メソッド。今までのログを確定して返し、以降のprocessFrameは無視される。
   */
  public endSession(): RepLog[] {
    this.phase = 'finished';
    return [...this.repLog];
  }

  public speakAdvice(text: string) {
    // 話している最中なら、今回のアドバイスは諦める（割り込ませない）
    if (this.isSpeaking) return;
    this.isSpeaking = true;

    const resetSpeaking = () => {
      this.isSpeaking = false;
    };

    // rate: 1.0が標準速度。読み上げが長いとisSpeakingガードで
    // 次のアドバイスが取りこぼされやすくなるため、少し速めにしている。
    safeSpeech.speak(text, {
      language: 'ja-JP',
      rate: 1.4,
      onDone: resetSpeaking,
      onStopped: resetSpeaking,
      onError: resetSpeaking,
    });
  }

  public processFrame(rawLandmarks: Landmark[], onUpdate: (r: FrameResult) => void) {
    if (this.phase === 'finished') return;

    const {
      sideLandmarks, minVisibilityMargin, noSideInstructionText, depthRole,
      standingYThreshold, startDelta, minRepDepthDelta, riseDelta, cooldownMs,
      joints, angleCheck, getAdvice,
      praiseText, targetGoodReps, completionText,
    } = this.config;

    // --- ステップ1: 左右どちらかの側が、全身映っていると言える程度に見えているか ---
    const wasVisible = this.phase !== 'checking_visibility' && this.phase !== 'init';
    const enterThreshold = 0.6;
    const exitThreshold = 0.4;
    const requiredThreshold = wasVisible ? exitThreshold : enterThreshold;

    const sideRoughlyVisible = (side: SideLandmarks) =>
      (rawLandmarks[side.shoulder]?.visibility ?? 0) > requiredThreshold &&
      (rawLandmarks[side.ankle]?.visibility ?? 0) > requiredThreshold;

    const fullBodyVisible =
      sideRoughlyVisible(sideLandmarks.left) || sideRoughlyVisible(sideLandmarks.right);

    if (!fullBodyVisible) {
      if (this.phase !== 'checking_visibility') {
        this.phase = 'checking_visibility';
        this.smoothed = [];
        this.activeSide = null;
        // 完全にフレームアウトしたので、次にREADYになったら改めて知らせる
        this.hasAnnouncedReady = false;
        onUpdate({ advice: '全身をカメラに映してください', isReady: false });
      }
      return;
    }

    // --- ステップ2: 左右どちらの側を採点に使うか自動判定 ---
    // 一度readyになったら、途中でブレないよう毎フレームは判定し直さない
    if (this.phase !== 'ready') {
      const leftAvg = this.avgVisibility(rawLandmarks, this.sideIndices(sideLandmarks.left));
      const rightAvg = this.avgVisibility(rawLandmarks, this.sideIndices(sideLandmarks.right));
      const diff = leftAvg - rightAvg;

      if (Math.abs(diff) <= minVisibilityMargin) {
        // 正面すぎる、あるいはどちらの側かまだ判別できない
        if (this.phase !== 'checking_direction') {
          this.phase = 'checking_direction';
          this.speakAdvice(noSideInstructionText);
          onUpdate({ advice: noSideInstructionText, isReady: false });
        }
        return;
      }

      this.activeSide = diff > 0 ? 'left' : 'right';
    }

    if (!this.activeSide) return; // 型ガード（実際には起こらない）
    const L = sideLandmarks[this.activeSide];

    // --- ステップ3: READY ---
    if (this.phase !== 'ready') {
      this.phase = 'ready';
      if (!this.hasAnnouncedReady) {
        this.hasAnnouncedReady = true;
        this.speakAdvice('全身を確認しました。動作を開始してください');
      }
      onUpdate({ advice: '動作を開始してください', isReady: true });
    }

    const landmarks = this.smoothLandmarks(rawLandmarks);
    const depthY = landmarks[L[depthRole]].y;

    const now = Date.now();
    const inCooldown = now - this.lastRepAt < cooldownMs;

    if (!inCooldown && depthY > standingYThreshold + startDelta) {
      this.isMoving = true;
    }

    if (this.isMoving) {
      if (depthY > this.deepestY) {
        this.deepestY = depthY;
      } else if (this.deepestY - depthY > riseDelta) {
        // 十分な深さに到達していなければ「1回」とカウントせず、静かにリセットする
        if (this.deepestY < standingYThreshold + minRepDepthDelta) {
          this.isMoving = false;
          this.deepestY = 0.0;
          return;
        }

        const jointSimilarities: Record<string, number> = {};
        const jointAngles: Record<string, number> = {};
        joints.forEach((j) => {
          const v = {
            x: landmarks[L[j.to]].x - landmarks[L[j.from]].x,
            y: landmarks[L[j.to]].y - landmarks[L[j.from]].y,
          };
          jointSimilarities[j.id] = this.directionAgnosticSimilarity(v, j.ideal);
          // 床(水平)からの角度。0°=水平(床と平行)、90°=垂直。左右どちらの向きでも同じ値になる。
          jointAngles[j.id] = Math.abs(Math.atan2(Math.abs(v.y), Math.abs(v.x)) * (180 / Math.PI));
        });
        const avgSimilarity =
          Object.values(jointSimilarities).reduce((a, b) => a + b, 0) / joints.length;

        // 素点（コサイン類似度の平均）は理想ベクトルとの厳密な一致を要求するため
        // 体感よりかなり低く出やすい。平方根カーブで緩やかに底上げする。
        const curvedSimilarity = Math.sqrt(Math.sqrt(Math.max(0, avgSimilarity)));
        let score = Math.max(0, Math.min(100, Math.floor(curvedSimilarity * 100)));

        const kneeAngle = this.calculateAngle(
          landmarks[L[angleCheck.hip]],
          landmarks[L[angleCheck.knee]],
          landmarks[L[angleCheck.ankle]]
        );

        // 膝つま先チェック: 股関節→膝のベクトルの向き（x符号）を「前方向」の基準にして、
        // 左向き/右向きどちらでも「膝が前に出過ぎ」を同じ意味で判定できるようにする
        const hipToKnee = {
          x: landmarks[L.knee].x - landmarks[L.hip].x,
          y: landmarks[L.knee].y - landmarks[L.hip].y,
        };
        const forwardSign = hipToKnee.x >= 0 ? 1 : -1;
        const scaleLength = this.distance(landmarks[L.knee], landmarks[L.ankle]);
        const kneeForwardRatio =
          scaleLength > 0
            ? (forwardSign * (landmarks[L.knee].x - landmarks[L.toe].x)) / scaleLength
            : 0;

        const advice = getAdvice({ kneeAngle, jointSimilarities, jointAngles, kneeForwardRatio });
        const isGoodForm = advice === praiseText;

        if (!isGoodForm) score = Math.min(score, NG_SCORE_CAP);

        this.repLog.push({
          repNumber: this.repLog.length + 1,
          score,
          advice,
          isGoodForm,
        });
        if (isGoodForm) this.goodRepCount += 1;

        this.isMoving = false;
        this.deepestY = 0.0;
        this.lastRepAt = now;

        if (this.goodRepCount >= targetGoodReps) {
          this.phase = 'finished';
          this.speakAdvice(completionText);
          onUpdate({
            score,
            advice: completionText,
            isReady: true,
            countIncrement: true,
            sessionFinished: true,
            sessionLog: [...this.repLog],
          });
          return;
        }

        this.speakAdvice(advice);
        onUpdate({ score, advice, isReady: true, countIncrement: true });
      }
    }
  }
}
