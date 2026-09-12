/**
 * 大目標の入力（"/goal/create"）
 * -------------------------------------------------------------
 * ゼロフリクション方針。チャットではなく1つの自由入力だけ。
 * ふわっとした願いでOK、というトーンでハードルを下げる。
 * モノトーン基調 ＋ 星のあしらいで認証画面とトーンを統一。
 */

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

import { MonoColors, MonoGlyph, MonoLayout } from '@/constants/mono-theme';
import { goalDraft } from '@/lib/goal-draft';
import { tapImpact } from '@/lib/haptics';

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
          <Text style={styles.step}>{MonoGlyph.star} STEP 1 / 3</Text>
          <Text style={styles.title}>どんな自分になりたい？</Text>
          <Text style={styles.sub}>ざっくりでOK。あとはアプリが分解します</Text>

          <TextInput
            style={styles.input}
            placeholder="例）3ヶ月で腹筋を割りたい"
            placeholderTextColor={MonoColors.textMuted}
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
    backgroundColor: MonoColors.screenBg,
    paddingHorizontal: MonoLayout.screenPadding,
  },
  flex: { flex: 1 },
  step: {
    fontSize: 12,
    letterSpacing: 2,
    color: MonoColors.accent,
    fontWeight: '700',
    marginTop: 16,
  },
  title: {
    fontSize: 25,
    fontWeight: '700',
    color: MonoColors.ink,
    marginTop: 8,
  },
  sub: {
    fontSize: 13,
    color: MonoColors.textSecondary,
    marginTop: 6,
    marginBottom: 20,
  },
  input: {
    backgroundColor: MonoColors.surface,
    borderWidth: 1,
    borderColor: MonoColors.border,
    borderRadius: MonoLayout.radiusControl,
    padding: 16,
    minHeight: 96,
    fontSize: 17,
    color: MonoColors.ink,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: MonoColors.ink,
    borderRadius: MonoLayout.radiusControl,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    color: MonoColors.onInk,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
