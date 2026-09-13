import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { GlobalMenuBar } from '@/components/home-menu-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { installNotificationHandler, syncDailyReminder } from '@/lib/reminders';
import { DEFAULT_REMINDER_HOUR, pushWidgetSnapshot } from '@/lib/widget-bridge';
import { registerForPushNotificationsAsync } from '@/services/notificationService';
import { fetchStreakDays } from '@/services/workoutService';
import { supabase } from '@/supabase';

export const unstable_settings = {
  // 起動時はホーム（タブ）から。筋トレ・目標はそこから開始する。
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  // 通知をタップしてアプリを開いたら、通知に紐づく画面へ遷移する。
  // ・アプリがバックグラウンド/フォアグラウンドのとき → addNotificationResponseReceivedListener
  // ・アプリが完全に終了していて通知タップで起動した（コールドスタート）とき
  //   → 上のリスナーは間に合わないので getLastNotificationResponseAsync() で拾う
  useEffect(() => {
    const goToNotificationScreen = (response: Notifications.NotificationResponse) => {
      const screen = response.notification.request.content.data?.screen;
      if (typeof screen === 'string') {
        router.push(screen as Href);
      }
    };

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) goToNotificationScreen(response);
    });

    const sub = Notifications.addNotificationResponseReceivedListener(goToNotificationScreen);
    return () => sub.remove();
  }, [router]);

  // 起動時にホーム画面ウィジェットへ最新の連続日数を渡す（iOS のみ／他は no-op）。
  useEffect(() => {
    let alive = true;
    fetchStreakDays()
      .then((streakDays) => {
        if (!alive) return;
        pushWidgetSnapshot({ streakDays, reminderHour: DEFAULT_REMINDER_HOUR });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 毎日のリマインド通知を設定値に合わせて予約し直す（起動時＋ログイン状態の変化時）。
  useEffect(() => {
    // 1. ローカル通知ハンドラーの初期化とリマインド設定
    installNotificationHandler();
    void syncDailyReminder();

    // 2. プッシュ通知トークンの取得・更新
    void registerForPushNotificationsAsync();

    // 3. ログイン状態変化時にリマインドと Push トークンを再同期
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void syncDailyReminder();
      void registerForPushNotificationsAsync();
    });

    return () => sub.subscription.unsubscribe();
  }, []);    

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* 筋トレフロー：準備 → 筋トレ → サマリー */}
          <Stack.Screen name="workout/prepare" options={{ headerShown: false }} />
          <Stack.Screen name="workout/session" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="workout/summary" options={{ headerShown: false, gestureEnabled: false }} />
          {/* 目標ロードマップ：入力 → 10問 → 生成中 → ツリー */}
          <Stack.Screen name="goal/create" options={{ headerShown: false }} />
          <Stack.Screen name="goal/questions" options={{ headerShown: false }} />
          <Stack.Screen name="goal/generating" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="goal/index" options={{ headerShown: false }} />
          {/* 認証・設定 */}
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          {/* フレンド */}
          <Stack.Screen name="friends" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <GlobalMenuBar />
      </View>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}