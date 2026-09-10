import { Tabs } from 'expo-router';
import React from 'react';

/**
 * タブのレイアウト。
 * 画面下部のナビゲーションは各画面に置く <HomeMenuBar /> に統一したため、
 * OS標準のタブバーは非表示にしています。
 */
export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="index" options={{ title: 'ホーム' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore', href: null }} />
    </Tabs>
  );
}
