import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  // 起動時はホーム（タブ）から。筋トレ・目標はそこから開始する。
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
