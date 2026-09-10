/**
 * 前提10問（"/goal/questions"）
 * -------------------------------------------------------------
 * GOAL_QUESTIONS を1問ずつ表示。ボタン選択のみ（チャットしない）。
 *  - 単一選択 / はい・いいえ … タップしたら自動で次へ
 *  - 複数選択（器具）… トグルして「次へ」。'none'（自重のみ）は他と排他
 * 最後まで答えたら生成中画面へ。
 * モノトーン基調 ＋ 星のあしらいで認証画面とトーンを統一。
 */

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  GOAL_QUESTIONS,
  type GoalQuestion,
  type OptionValue,
} from '@/constants/goal-questions';
import { MonoColors, MonoLayout } from '@/constants/mono-theme';
import { goalDraft } from '@/lib/goal-draft';
import { tapImpact, tapLight } from '@/lib/haptics';

const TOTAL = GOAL_QUESTIONS.length;

export default function GoalQuestionsScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);

  const q: GoalQuestion = GOAL_QUESTIONS[index];

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

  const progress = ((index + 1) / TOTAL) * 100;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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

      {/* key で問題ごとに選択状態をリセット（下書きから復元） */}
      <QuestionStep key={q.field} question={q} onNext={goNext} />
    </SafeAreaView>
  );
}

/* ---------- 1問ぶんの選択UI ---------- */

function QuestionStep({
  question: q,
  onNext,
}: {
  question: GoalQuestion;
  onNext: () => void;
}) {
  const saved = goalDraft.getAnswer(q.field);
  const [picked, setPicked] = useState<OptionValue | null>(
    q.kind === 'multi' || saved === undefined || Array.isArray(saved) ? null : saved,
  );
  const [multiSel, setMultiSel] = useState<OptionValue[]>(
    q.kind === 'multi' && Array.isArray(saved) ? saved : [],
  );

  const pickSingle = (value: OptionValue) => {
    tapLight();
    setPicked(value);
    goalDraft.setAnswer(q.field, value);
    setTimeout(onNext, 180);
  };

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
    onNext();
  };

  return (
    <>
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
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MonoColors.screenBg,
    paddingHorizontal: MonoLayout.screenPadding,
  },
  flex: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
  },
  back: {
    fontSize: 30,
    color: MonoColors.inkSoft,
    lineHeight: 30,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: MonoColors.surfaceAlt,
    borderRadius: MonoLayout.radiusPill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: MonoColors.ink,
    borderRadius: MonoLayout.radiusPill,
  },
  count: {
    fontSize: 12,
    color: MonoColors.textSecondary,
    minWidth: 44,
    textAlign: 'right',
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: MonoColors.ink,
    marginTop: 24,
  },
  hint: {
    fontSize: 13,
    color: MonoColors.textSecondary,
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
    backgroundColor: MonoColors.surface,
    borderWidth: 1,
    borderColor: MonoColors.border,
    borderRadius: MonoLayout.radiusControl,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  optionActive: {
    backgroundColor: MonoColors.ink,
    borderColor: MonoColors.ink,
  },
  optionText: {
    fontSize: 16,
    color: MonoColors.ink,
  },
  optionTextActive: {
    color: MonoColors.onInk,
    fontWeight: '600',
  },
  check: {
    color: MonoColors.onInk,
    fontSize: 16,
    fontWeight: '700',
  },
  footerHint: {
    textAlign: 'center',
    fontSize: 12,
    color: MonoColors.textMuted,
    marginBottom: 12,
  },
  nextButton: {
    backgroundColor: MonoColors.ink,
    borderRadius: MonoLayout.radiusControl,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  nextDisabled: { opacity: 0.4 },
  nextText: {
    color: MonoColors.onInk,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
