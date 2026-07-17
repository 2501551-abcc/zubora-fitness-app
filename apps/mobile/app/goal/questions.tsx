/**
 * 前提10問（"/goal/questions"）
 * -------------------------------------------------------------
 * GOAL_QUESTIONS を1問ずつ表示。ボタン選択のみ（チャットしない）。
 *  - 単一選択 / はい・いいえ … タップしたら自動で次へ
 *  - 複数選択（器具）… トグルして「次へ」。'none'（自重のみ）は他と排他
 * 最後まで答えたら生成中画面へ。
 */

import {
  GOAL_QUESTIONS,
  type GoalQuestion,
  type OptionValue,
} from '@/constants/goal-questions';
import { WorkoutColors } from '@/constants/workout-theme';
import { goalDraft } from '@/lib/goal-draft';
import { tapImpact, tapLight } from '@/lib/haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TOTAL = GOAL_QUESTIONS.length;

export default function GoalQuestionsScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<OptionValue | null>(null);
  const [multiSel, setMultiSel] = useState<OptionValue[]>([]);

  const q: GoalQuestion = GOAL_QUESTIONS[index];

  // 質問が変わったら選択状態を下書きから復元
  useEffect(() => {
    const saved = goalDraft.getAnswer(q.field);
    if (q.kind === 'multi') {
      setMultiSel(Array.isArray(saved) ? saved : []);
      setPicked(null);
    } else {
      setMultiSel([]);
      setPicked(saved === undefined || Array.isArray(saved) ? null : saved);
    }
  }, [index, q.field, q.kind]);

  const goNext = () => {
    if (index >= TOTAL - 1) {
      router.replace('/goal/generating');
    } else {
      setIndex((i) => i + 1);
    }
  };

  const goBack = () => {
    if (index === 0) {
      router.back();
    } else {
      setIndex((i) => i - 1);
    }
  };

  // 単一選択・はい/いいえ：選んだら自動で次へ
  const pickSingle = (value: OptionValue) => {
    tapLight();
    setPicked(value);
    goalDraft.setAnswer(q.field, value);
    setTimeout(goNext, 180);
  };

  // 複数選択：トグル（'none' は排他）
  const toggleMulti = (value: OptionValue) => {
    tapLight();
    setMultiSel((prev) => {
      const isExclusive = value === q.exclusiveValue;
      if (isExclusive) return prev.includes(value) ? [] : [value];
      const withoutExclusive = prev.filter((v) => v !== q.exclusiveValue);
      return withoutExclusive.includes(value)
        ? withoutExclusive.filter((v) => v !== value)
        : [...withoutExclusive, value];
    });
  };

  const confirmMulti = () => {
    if (multiSel.length === 0) return;
    tapImpact();
    goalDraft.setAnswer(q.field, multiSel);
    goNext();
  };

  const progress = ((index + 1) / TOTAL) * 100;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 進捗＋戻る */}
      <View style={styles.topRow}>
        <Pressable onPress={goBack} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.count}>
          {index + 1} / {TOTAL}
        </Text>
      </View>

      <Text style={styles.title}>{q.title}</Text>
      {q.hint ? <Text style={styles.hint}>{q.hint}</Text> : null}

      <View style={styles.options}>
        {q.options.map((opt) => {
          const active =
            q.kind === 'multi' ? multiSel.includes(opt.value) : picked === opt.value;
          return (
            <Pressable
              key={String(opt.value)}
              onPress={() =>
                q.kind === 'multi' ? toggleMulti(opt.value) : pickSingle(opt.value)
              }
              style={[styles.option, active && styles.optionActive]}>
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {opt.label}
              </Text>
              {active ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.flex} />

      {q.kind === 'multi' ? (
        <Pressable
          style={[styles.nextButton, multiSel.length === 0 && styles.nextDisabled]}
          onPress={confirmMulti}
          disabled={multiSel.length === 0}>
          <Text style={styles.nextText}>次へ</Text>
        </Pressable>
      ) : (
        <Text style={styles.footerHint}>タップで次の質問へ進みます</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WorkoutColors.screenBg,
    paddingHorizontal: 20,
  },
  flex: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
  },
  back: {
    fontSize: 30,
    color: WorkoutColors.textSecondary,
    lineHeight: 30,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: WorkoutColors.border,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: WorkoutColors.primary,
    borderRadius: 999,
  },
  count: {
    fontSize: 12,
    color: WorkoutColors.textSecondary,
    minWidth: 44,
    textAlign: 'right',
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: WorkoutColors.textPrimary,
    marginTop: 24,
  },
  hint: {
    fontSize: 13,
    color: WorkoutColors.textSecondary,
    marginTop: 6,
  },
  options: {
    marginTop: 20,
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WorkoutColors.surface,
    borderWidth: 1,
    borderColor: WorkoutColors.border,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  optionActive: {
    backgroundColor: WorkoutColors.primary,
    borderColor: WorkoutColors.primary,
  },
  optionText: {
    fontSize: 16,
    color: WorkoutColors.textPrimary,
  },
  optionTextActive: {
    color: WorkoutColors.onAccent,
    fontWeight: '600',
  },
  check: {
    color: WorkoutColors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  footerHint: {
    textAlign: 'center',
    fontSize: 12,
    color: WorkoutColors.textMuted,
    marginBottom: 12,
  },
  nextButton: {
    backgroundColor: WorkoutColors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  nextDisabled: {
    opacity: 0.4,
  },
  nextText: {
    color: WorkoutColors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
});
