import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/supabase';

// アプリフォアグラウンド時の通知表示設定
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** 端末の Push トークンを取得して Supabase に保存 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) {
    console.log('Web環境またはシミュレーターのため、プッシュ通知登録をスキップします');
    return null;
  }

  // Android用の通知チャンネル設定
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('通知権限が拒否されました');
    return null;
  }

  // Expo Push Token 取得
  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  // ログイン中のユーザーの push_token を更新
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    await supabase.from('users').update({ push_token: token }).eq('id', auth.user.id);
  }

  return token;
}

/** 相手の Push Token 宛に Expo Push API 経由で通知を送信 */
export async function sendPushNotification(
  targetPushToken: string,
  title: string,
  body: string,
) {
  if (!targetPushToken) return;

  const message = {
    to: targetPushToken,
    sound: 'default',
    title,
    body,
    data: { someData: 'goes here' },
  };

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
}