/**
 * 生成中（"/goal/generating"）
 * -------------------------------------------------------------
 * 回答を組み立てて generateRoadmap() を呼ぶ。本番は約30秒かかるので、
 * 「相棒が考えてくれてる」感のある待ち画面で間を持たせる。
 * 生成できたら下書きに結果を載せて /goal へ。失敗したらメッセージ＋やり直し。
 * モノトーン基調 ＋ 星のあしらいで認証画面とトーンを統一。
 */

import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MonoColors, MonoGlyph, MonoLayout } from '@/constants/mono-theme';
import { goalDraft } from '@/lib/goal-draft';
import { notifySuccess } from '@/lib/haptics';
import { generateRoadmap } from '@/services/goalService';

export default function GoalGeneratingScreen() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [dot] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dot, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(dot, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dot]);

  useEffect(() => {
    let alive = true;
    generateRoadmap(goalDraft.toInput())
      .then((roadmap) => {
        if (!alive) return;
        goalDraft.setRoadmap(roadmap);
        notifySuccess();
        router.replace('/goal');
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [router, attempt]);

  if (failed) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.title}>作成に失敗しました</Text>
          <Text style={styles.sub}>通信状況を確認して、もう一度お試しください</Text>
          <Pressable
            style={styles.retry}
            onPress={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}>
            <Text style={styles.retryText}>もう一度試す</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const dot2 = dot.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });
  const dot3 = dot.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.25] });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <View style={styles.dots}>
          <View style={[styles.dot, { opacity: 1 }]} />
          <Animated.View style={[styles.dot, { opacity: dot2 }]} />
          <Animated.View style={[styles.dot, { opacity: dot3 }]} />
        </View>
        <Text style={styles.glyph}>{MonoGlyph.sparkle}</Text>
        <Text style={styles.title}>ロードマップを作成中</Text>
        <Text style={styles.sub}>
          あなたの答えをもとに、無理のない{'\n'}プランを組み立てています
        </Text>
        <Text style={styles.wait}>30秒ほどかかります</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MonoColors.screenBg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: MonoColors.ink,
  },
  glyph: { fontSize: 22, marginBottom: 10 },
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: MonoColors.ink,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    color: MonoColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 12,
  },
  wait: {
    fontSize: 12,
    color: MonoColors.accent,
    fontWeight: '600',
    marginTop: 20,
  },
  retry: {
    backgroundColor: MonoColors.ink,
    borderRadius: MonoLayout.radiusControl,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 24,
  },
  retryText: {
    color: MonoColors.onInk,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
