/**
 * 準備画面（"/workout/prepare"）
 * -------------------------------------------------------------
 * ホームの「筋トレを始める」やウィジェット/通知からここへ来る想定。
 *  - 画面を開いた瞬間に「15秒カウントダウン」が自動で始まる。
 *  - その15秒のあいだにドラムロールで筋トレ時間を決めてもらう。
 *  - 0秒になったら今選ばれている時間で自動スタート（ずぼら向け）。
 *  - スタートボタンで即開始も可能。
 *  - 目標ロードマップの「今週のタスク」があれば、最初の1種目をそのメニューに
 *    差し替える（fetchThisWeekFocus）。取得は画面を開いた瞬間に裏で始めるので、
 *    自動スタートの体感速度は変わらない。取得できなければ通常のローテーション。
 */

import { DrumRollPicker, type DrumRollItem } from '@/components/workout/drum-roll-picker';
import { MonoColors } from '@/constants/mono-theme';
import { WorkoutColors, WorkoutLayout } from '@/constants/workout-theme';
import { WORKOUT_MENU_TAGS } from '@/constants/workout-menu-tags';
import { tapImpact } from '@/lib/haptics';
import { syncDailyReminder } from '@/lib/reminders';
import { fetchThisWeekFocus } from '@/services/goalService';
import { getDurationOptions } from '@/services/workoutService';
import { LEVEL_LABELS, type WorkoutLevel } from '@/types/workout';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** 開いた瞬間から自動スタートまでの秒数 */
const PREP_SECONDS = 15;
/** 初期選択の時間（分） */
const DEFAULT_MINUTES = 15;

const LEVELS: WorkoutLevel[] = ['easy', 'normal', 'hard'];

export default function PrepareScreen() {
  const router = useRouter();

  const durationItems: DrumRollItem[] = useMemo(
    () => getDurationOptions().map((o) => ({ value: o.minutes, label: o.label })),
    [],
  );

  const [selectedMinutes, setSelectedMinutes] = useState(DEFAULT_MINUTES);
  const [level, setLevel] = useState<WorkoutLevel>('normal');
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS);

  // 最新の選択値を ref で保持（カウントダウン0秒での自動スタートに使う）
  const minutesRef = useRef(selectedMinutes);
  const levelRef = useRef(level);
  minutesRef.current = selectedMinutes;
  levelRef.current = level;

  const startedRef = useRef(false);

  // 今週のタスクの推奨メニュー（workout_menu_tag → 表示名）。画面を開いた瞬間に
  // 裏で取れるだけ取っておき、開始時にはその時点の結果を使う（無ければ通常通り）。
  const firstExerciseRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetchThisWeekFocus()
      .then((focus) => {
        if (!alive || !focus?.workoutMenuTag) return;
        firstExerciseRef.current = WORKOUT_MENU_TAGS.find(
          (t) => t.tag === focus.workoutMenuTag,
        )?.exerciseName;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 筋トレ画面へ遷移（自動 / 手動どちらからも呼ばれる。二重遷移をガード）
  const goToWorkout = useCallback(
    (manual: boolean) => {
      if (startedRef.current) return;
      startedRef.current = true;
      if (manual) tapImpact();

      // 設定値に合わせて毎日のリマインドを予約し直す（ブロックしない）
      void syncDailyReminder();

      router.replace({
        pathname: '/workout/session',
        params: {
          durationSec: String(minutesRef.current * 60),
          level: levelRef.current,
          ...(firstExerciseRef.current ? { firstExercise: firstExerciseRef.current } : {}),
        },
      });
    },
    [router],
  );

  // 15秒カウントダウン。setState の更新関数は副作用を起こさない純粋な形に。
  useEffect(() => {
    const id = setInterval(() => {
      setPrepLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 0秒になったら自動スタート。コミット後の useEffect で行うことで、
  // 「別コンポーネントのレンダー中に setState」警告（router.replace が
  // NavigationContainer を更新するため）を避ける。
  useEffect(() => {
    if (prepLeft === 0) {
      goToWorkout(false);
    }
  }, [prepLeft, goToWorkout]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.hello}>今日はどれくらい？</Text>
        <Text style={styles.title}>筋トレ時間を決めよう</Text>
      </View>

      {/* 15秒カウントダウンの案内 */}
      <View style={styles.countdownPill}>
        <Text style={styles.countdownText}>
          あと <Text style={styles.countdownNum}>{prepLeft}</Text> 秒で自動スタート
        </Text>
      </View>

      {/* ドラムロール（時間選択の主役） */}
      <View style={styles.drumWrap}>
        <DrumRollPicker
          items={durationItems}
          selectedValue={selectedMinutes}
          onValueChange={setSelectedMinutes}
        />
      </View>

      {/* レベル選択 */}
      <View style={styles.levelRow}>
        {LEVELS.map((lv) => {
          const active = lv === level;
          return (
            <Pressable
              key={lv}
              onPress={() => setLevel(lv)}
              style={[styles.levelChip, active && styles.levelChipActive]}>
              <Text style={[styles.levelText, active && styles.levelTextActive]}>
                {LEVEL_LABELS[lv]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* 即スタート */}
      <Pressable style={styles.startButton} onPress={() => goToWorkout(true)}>
        <Text style={styles.startText}>{selectedMinutes}分でスタート</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MonoColors.screenBg,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  header: {
    paddingTop: 12,
  },
  hello: {
    fontSize: 14,
    color: MonoColors.textSecondary,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: MonoColors.ink,
    marginTop: 4,
  },
  countdownPill: {
    alignSelf: 'center',
    backgroundColor: MonoColors.surfaceAlt,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  countdownText: {
    fontSize: 14,
    color: MonoColors.inkSoft,
  },
  countdownNum: {
    fontSize: 18,
    fontWeight: '700',
    color: MonoColors.ink,
  },
  drumWrap: {
    backgroundColor: MonoColors.surface,
    borderRadius: WorkoutLayout.radiusCard,
    borderWidth: 1,
    borderColor: MonoColors.border,
    paddingVertical: 8,
  },
  levelRow: {
    flexDirection: 'row',
    gap: 10,
  },
  levelChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: MonoColors.surface,
    borderWidth: 1,
    borderColor: MonoColors.border,
  },
  levelChipActive: {
    backgroundColor: MonoColors.surfaceAlt,
    borderColor: MonoColors.ink,
  },
  levelText: {
    fontSize: 15,
    color: MonoColors.textSecondary,
  },
  levelTextActive: {
    color: MonoColors.ink,
    fontWeight: '600',
  },
  startButton: {
    backgroundColor: MonoColors.ink,
    borderRadius: WorkoutLayout.radiusControl,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  startText: {
    color: WorkoutColors.onAccent,
    fontSize: 19,
    fontWeight: '700',
  },
});