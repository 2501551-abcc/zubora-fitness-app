/**
 * フォーム判定画面のWeb版スタブ（"/workout/pose-analysis"、Webビルドのときだけ使われる）
 * -------------------------------------------------------------
 * react-native-vision-camera / react-native-mediapipe はネイティブ専用のモジュールで
 * Web版の実装を持たないため、`npx expo start --web` のバンドル対象に本来の
 * pose-analysis.tsx が含まれるとビルド自体が失敗する。
 *
 * Expo Routerは同じ画面名で `*.web.tsx` があれば、Webビルド時はそちらを優先して
 * 使う仕組みになっているため、このファイルでカメラ処理を持たない代わりの画面を用意し、
 * 「タイマー画面→スクワットボタン→この画面まで遷移できるか」だけを確認できるようにしている。
 *
 * 本番（iOS/Android）では pose-analysis.tsx がそのまま使われるので、
 * このファイルの中身を直す必要は基本的にない。
 */

import { WorkoutColors, WorkoutLayout } from '@/constants/workout-theme';
import { tapImpact } from '@/lib/haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function PoseAnalysisWebStub() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionEndTime?: string }>();

  const backToSession = () => {
    tapImpact();
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>📷</Text>
      <Text style={styles.title}>ここにカメラ画面が表示されます</Text>
      <Text style={styles.desc}>
        スクワットのフォーム判定はカメラが必要なため、PCのブラウザ版では動作しません。
        {'\n'}この画面が表示されていれば、タイマー画面からスクワットボタンまでの導線は
        正しくつながっています。iOS実機ではここに実際のカメラ映像とフォーム判定が表示されます。
      </Text>
      {params.sessionEndTime && (
        <Text style={styles.debug}>
          受け取ったsessionEndTime: {params.sessionEndTime}
        </Text>
      )}
      <Pressable style={styles.backButton} onPress={backToSession}>
        <Text style={styles.backButtonText}>セッションに戻る</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WorkoutColors.deep,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  desc: { color: WorkoutColors.soft, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  debug: { color: WorkoutColors.soft, fontSize: 11, opacity: 0.7, marginBottom: 24 },
  backButton: {
    backgroundColor: WorkoutColors.primary,
    borderRadius: WorkoutLayout.radiusControl,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  backButtonText: { color: WorkoutColors.onAccent, fontSize: 15, fontWeight: '700' },
});
