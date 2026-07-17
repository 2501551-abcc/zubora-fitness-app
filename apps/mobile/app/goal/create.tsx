/**
 * 大目標の入力（"/goal/create"）
 * -------------------------------------------------------------
 * ゼロフリクション方針。チャットではなく1つの自由入力だけ。
 * ふわっとした願いでOK、というトーンでハードルを下げる。
 */

import { WorkoutColors, WorkoutLayout } from '@/constants/workout-theme';
import { goalDraft } from '@/lib/goal-draft';
import { tapImpact } from '@/lib/haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function GoalCreateScreen() {
  const router = useRouter();
  const [text, setText] = useState(goalDraft.getGoalText());

  const canNext = text.trim().length > 0;

  const next = () => {
    if (!canNext) return;
    tapImpact();
    goalDraft.setGoalText(text);
    router.push('/goal/questions');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.flex}>
          <Text style={styles.step}>STEP 1 / 3</Text>
          <Text style={styles.title}>どんな自分になりたい？</Text>
          <Text style={styles.sub}>ざっくりでOK。あとはアプリが分解します</Text>

          <TextInput
            style={styles.input}
            placeholder="例）3ヶ月で腹筋を割りたい"
            placeholderTextColor={WorkoutColors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            maxLength={120}
          />
        </View>

        <Pressable
          style={[styles.button, !canNext && styles.buttonDisabled]}
          onPress={next}
          disabled={!canNext}>
          <Text style={styles.buttonText}>次へ</Text>
        </Pressable>
      </KeyboardAvoidingView>
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
  step: {
    fontSize: 12,
    letterSpacing: 2,
    color: WorkoutColors.primary,
    marginTop: 16,
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    color: WorkoutColors.textPrimary,
    marginTop: 8,
  },
  sub: {
    fontSize: 13,
    color: WorkoutColors.textSecondary,
    marginTop: 6,
    marginBottom: 20,
  },
  input: {
    backgroundColor: WorkoutColors.surface,
    borderWidth: 1,
    borderColor: WorkoutColors.border,
    borderRadius: 16,
    padding: 16,
    minHeight: 96,
    fontSize: 17,
    color: WorkoutColors.textPrimary,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: WorkoutColors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: WorkoutColors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
});
