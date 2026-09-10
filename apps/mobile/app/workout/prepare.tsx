/**
 * 準備画面（"/workout/prepare"）
 * -------------------------------------------------------------
 * ホームの「筋トレを始める」やウィジェット/通知からここへ来る想定。
 *  - 画面を開いた瞬間に「15秒カウントダウン」が自動で始まる。
 *  - その15秒のあいだにドラムロールで筋トレ時間を決めてもらう。
 *  - 0秒になったら今選ばれている時間で自動スタート（ずぼら向け）。
 *  - スタートボタンで即開始も可能。
 */

import { DrumRollPicker, type DrumRollItem } from '@/components/workout/drum-roll-picker';
import { WorkoutColors, WorkoutLayout } from '@/constants/workout-theme';
import { tapImpact } from '@/lib/haptics';
import { getDurationOptions } from '@/services/workoutService';
import { LEVEL_LABELS, type WorkoutLevel } from '@/types/workout';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';

// ★ 1. expo-notifications のインポート
import * as Notifications from 'expo-notifications';

// ★ 2. アプリ起動中（フォアグラウンド）でも通知をポップアップさせる設定
//    expo-notifications 0.32 (Expo SDK 54) からハンドラの形が変わり、
//    shouldShowAlert は shouldShowBanner / shouldShowList に分割された。
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** 開いた瞬間から自動スタートまでの秒数 */
const PREP_SECONDS = 15;
/** 初期選択の時間（分） */
const DEFAULT_MINUTES = 15;

const LEVELS: WorkoutLevel[] = ['easy', 'normal', 'hard'];

/*
// ★ 3. 通知セット関数（修正版）
const scheduleNextWorkoutNotification = async () => {
  try {
    // 既存の予約をクリア
    await Notifications.cancelAllScheduledNotificationsAsync();

    // 10秒後に通知を予約
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '💖 今日もゆるっといこう！',
        body: '10秒テスト完了！今日もサクッと動いてロードマップを進めよう✨',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 10,
        repeats: false,
      },
    });
    console.log('✅ 通知を10秒後に予約しました！');
  } catch (error) {
    console.log('❌ 通知予約エラー:', error);
  }
};
*/

// ★ 3. 本格版：Supabaseから通知時間を取得して毎日繰り返し通知を予約する関数
const scheduleNextWorkoutNotification = async () => {
  try {
    // 既存の予約をクリア
    await Notifications.cancelAllScheduledNotificationsAsync();

    // ログインユーザーの取得
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('⚠️ ユーザー未ログインのため通知予約をスキップしました');
      return;
    }

    // usersテーブルから設定を取得
    const { data: profile, error } = await supabase
      .from('users')
      .select('preferred_time_of_day, notification_enabled')
      .eq('id', user.id)
      .single();

    if (error) {
      console.log('❌ 通知設定の取得エラー:', error.message);
      return;
    }

    // 通知がオフの場合は予約しない
    if (!profile || !profile.notification_enabled) {
      console.log('ℹ️ ユーザーの通知設定がオフになっています');
      return;
    }

    // "21:00:00" などの文字列から「時」と「分」を取得
    const timeString = profile.preferred_time_of_day || '21:00:00';
    const [hourStr, minuteStr] = timeString.split(':');
    const targetHour = parseInt(hourStr, 10);
    const targetMinute = parseInt(minuteStr, 10);

    // 毎日指定時刻に繰り返し通知を予約
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '💖 今日もゆるっといこう！',
        body: '今日の筋トレタイムだよ！サクッと動いてロードマップを進めよう✨',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: targetHour,
        minute: targetMinute,
      },
    });

    console.log(`✅ 毎日 ${targetHour}:${targetMinute.toString().padStart(2, '0')} のリマインド通知を予約しました！`);
  } catch (error) {
    console.log('❌ 通知予約エラー:', error);
  }
};


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

// ★ 4. 初期化処理（権限取得 ＋ Android用チャンネル作成）
  useEffect(() => {
    async function setupNotifications() {
      // Androidの場合は通知チャンネルの設定が必要
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF2366',
        });
      }

      // 権限の確認と要求
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('⚠️ 通知権限が拒否されました');
      }
    }

    setupNotifications();
  }, []);

  // 筋トレ画面へ遷移（自動 / 手動どちらからも呼ばれる。二重遷移をガード）
  const goToWorkout = useCallback(
    async (manual: boolean) => {
      if (startedRef.current) return;
      startedRef.current = true;
      if (manual) tapImpact();

      // ★ 5. 【最重要】ここで通知予約関数を実行！
      await scheduleNextWorkoutNotification();

      router.replace({
        pathname: '/workout/session',
        params: {
          durationSec: String(minutesRef.current * 60),
          level: levelRef.current,
        },
      });
    },
    [router],
  );

  // 15秒カウントダウン。0になったら自動スタート。
  useEffect(() => {
    const id = setInterval(() => {
      setPrepLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          goToWorkout(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [goToWorkout]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.hello}>今日はどれくらい？</Text>
        <Text style={styles.title}>回してサッと決めよう</Text>
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
    backgroundColor: WorkoutColors.screenBg,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  header: {
    paddingTop: 12,
  },
  hello: {
    fontSize: 14,
    color: WorkoutColors.textSecondary,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: WorkoutColors.textPrimary,
    marginTop: 4,
  },
  countdownPill: {
    alignSelf: 'center',
    backgroundColor: WorkoutColors.mist,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  countdownText: {
    fontSize: 14,
    color: WorkoutColors.ink,
  },
  countdownNum: {
    fontSize: 18,
    fontWeight: '700',
    color: WorkoutColors.primary,
  },
  drumWrap: {
    backgroundColor: WorkoutColors.surface,
    borderRadius: WorkoutLayout.radiusCard,
    borderWidth: 1,
    borderColor: WorkoutColors.border,
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
    backgroundColor: WorkoutColors.surface,
    borderWidth: 1,
    borderColor: WorkoutColors.border,
  },
  levelChipActive: {
    backgroundColor: WorkoutColors.mist,
    borderColor: WorkoutColors.soft,
  },
  levelText: {
    fontSize: 15,
    color: WorkoutColors.textSecondary,
  },
  levelTextActive: {
    color: WorkoutColors.ink,
    fontWeight: '600',
  },
  startButton: {
    backgroundColor: WorkoutColors.primary,
    borderRadius: WorkoutLayout.radiusControl,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  startText: {
    color: WorkoutColors.onAccent,
    fontSize: 17,
    fontWeight: '600',
  },
});