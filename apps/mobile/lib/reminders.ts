/**
 * 毎日のリマインド通知（ローカル通知）
 * -------------------------------------------------------------
 * ・users.notification_enabled / preferred_time_of_day に合わせて予約し直す
 * ・設定変更時（設定画面）とアプリ起動時（_layout）に syncDailyReminder() を呼ぶ
 *
 * ※ Expo Go（特に iOS）ではローカル通知が不安定なことがあります。
 *   確実に受け取るには development build を使ってください。
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/supabase';

/** この ID の予約だけを対象に取り消し／再予約する（他の予約は触らない） */
export const DAILY_REMINDER_ID = 'daily-workout-reminder';
const ANDROID_CHANNEL_ID = 'reminder';

let handlerInstalled = false;

/** フォアグラウンドでも通知を表示するハンドラ（多重登録しても上書きされるだけ） */
export function installNotificationHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'リマインド',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1D9E75',
  });
}

/** 通知権限を確認・要求。granted なら true。 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

function parseHm(t: string | null | undefined): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})/.exec((t ?? '').trim());
  if (!m) return { hour: 20, minute: 0 };
  return {
    hour: Math.min(23, Math.max(0, Number(m[1]))),
    minute: Math.min(59, Math.max(0, Number(m[2]))),
  };
}

/**
 * DB の通知設定に合わせて毎日のリマインドを予約し直す。
 * ・未ログイン / 通知OFF / 権限なし の場合は既存予約を解除するだけ
 * ・設定変更時とアプリ起動時に呼ぶ
 */
export async function syncDailyReminder(): Promise<void> {
  try {
    installNotificationHandler();
    await ensureAndroidChannel();

    // まず既存のリマインドを解除（workout カウントダウン等、他の予約には触らない）
    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('users')
      .select('preferred_time_of_day, notification_enabled')
      .eq('id', user.id)
      .single();

    if (!data || data.notification_enabled === false) return;

    const granted = await ensureNotificationPermission();
    if (!granted) return;

    const { hour, minute } = parseHm(data.preferred_time_of_day as string | null);

    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_REMINDER_ID,
      content: {
        title: '今日も頑張ろう 💪',
        body: '筋トレの時間だよ！筋トレしようよ！',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
  } catch (e) {
    console.warn('[reminders] syncDailyReminder に失敗しました', e);
  }
}

/** 動作確認用：数秒後にテスト通知を出す。権限が無ければ false。 */
export async function sendTestReminder(seconds = 3): Promise<boolean> {
  installNotificationHandler();
  await ensureAndroidChannel();
  const granted = await ensureNotificationPermission();
  if (!granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'テスト通知 ✅',
      body: 'この通知が届けば設定はOK。毎日この時間にリマインドします。',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, seconds),
      channelId: ANDROID_CHANNEL_ID,
    },
  });
  return true;
}
