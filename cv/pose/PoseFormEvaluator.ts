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

import { ExerciseConfig, Vector2D } from './exerciseConfig';

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

const SMOOTHING_ALPHA = 0.4;
const NG_SCORE_CAP = 75;

export class PoseFormEvaluator {
  private config: ExerciseConfig;
  private phase: Phase = 'init';
  private isMoving = false;
  private deepestY = 0.0;
  private lastRepAt = 0;
  private smoothed: Landmark[] = [];

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

    safeSpeech.speak(text, {
      language: 'ja-JP',
      rate: 1.0,
      onDone: resetSpeaking,
      onStopped: resetSpeaking,
      onError: resetSpeaking,
    });
  }

  public processFrame(rawLandmarks: Landmark[], onUpdate: (r: FrameResult) => void) {
    if (this.phase === 'finished') return;

    const {
      visibilityCheckpoints, directionCheck, depthLandmarkIdx,
      standingYThreshold, startDelta, minRepDepthDelta, riseDelta, cooldownMs,
      joints, angleCheck, kneeOverToeCheck, getAdvice,
      praiseText, targetGoodReps, completionText,
    } = this.config;

    // --- ステップ1: 全身が映っているか（ヒステリシス付き） ---
    const wasVisible = this.phase !== 'checking_visibility' && this.phase !== 'init';
    const enterThreshold = 0.6;
    const exitThreshold = 0.4;
    const requiredThreshold = wasVisible ? exitThreshold : enterThreshold;

    const fullBodyVisible = visibilityCheckpoints.every(
      (idx) => (rawLandmarks[idx]?.visibility ?? 0) > requiredThreshold
    );

    if (!fullBodyVisible) {
      if (this.phase !== 'checking_visibility') {
        this.phase = 'checking_visibility';
        this.smoothed = [];
        onUpdate({ advice: '全身をカメラに映してください', isReady: false });
      }
      return;
    }

    // --- ステップ2: 向き ---
    const facingAvg = this.avgVisibility(rawLandmarks, directionCheck.facingSideIndices);
    const awayAvg = this.avgVisibility(rawLandmarks, directionCheck.awaySideIndices);
    const correctDirection = facingAvg - awayAvg > directionCheck.minVisibilityMargin;

    if (!correctDirection) {
      if (this.phase !== 'checking_direction') {
        this.phase = 'checking_direction';
        this.speakAdvice(directionCheck.instructionText);
        onUpdate({ advice: directionCheck.instructionText, isReady: false });
      }
      return;
    }

    // --- ステップ3: READY ---
    // 向きチェックだけで一時的にNOT READYになった場合は、
    // 「全身を確認しました」を再度読み上げない（hasAnnouncedReadyが立っていれば無視）
    if (this.phase !== 'ready') {
      this.phase = 'ready';
      if (!this.hasAnnouncedReady) {
        this.hasAnnouncedReady = true;
        this.speakAdvice('全身を確認しました。動作を開始してください');
      }
      onUpdate({ advice: '動作を開始してください', isReady: true });
    }

    const landmarks = this.smoothLandmarks(rawLandmarks);
    const depthY = landmarks[depthLandmarkIdx].y;

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
        joints.forEach((j) => {
          const v = {
            x: landmarks[j.toIdx].x - landmarks[j.fromIdx].x,
            y: landmarks[j.toIdx].y - landmarks[j.fromIdx].y,
          };
          jointSimilarities[j.id] = this.cosineSimilarity(v, j.ideal);
        });
        const avgSimilarity =
          Object.values(jointSimilarities).reduce((a, b) => a + b, 0) / joints.length;

        // 素点（コサイン類似度の平均）は理想ベクトルとの厳密な一致を要求するため
        // 体感よりかなり低く出やすい。平方根カーブで緩やかに底上げする。
        const curvedSimilarity = Math.sqrt(Math.sqrt(Math.max(0, avgSimilarity)));
        let score = Math.max(0, Math.min(100, Math.floor(curvedSimilarity * 100)));

        const kneeAngle = this.calculateAngle(
          landmarks[angleCheck.hipIdx],
          landmarks[angleCheck.kneeIdx],
          landmarks[angleCheck.ankleIdx]
        );

        const scaleLength = this.distance(
          landmarks[kneeOverToeCheck.scaleFromIdx],
          landmarks[kneeOverToeCheck.scaleToIdx]
        );
        const kneeForwardRatio =
          scaleLength > 0
            ? (landmarks[kneeOverToeCheck.kneeIdx].x - landmarks[kneeOverToeCheck.toeIdx].x) /
              scaleLength
            : 0;

        const advice = getAdvice({ kneeAngle, jointSimilarities, kneeForwardRatio });
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