/**
 * 画面下部の横並びメニューバー
 * -------------------------------------------------------------
 * ホーム / 目標ロードマップ / フレンド / 設定 への導線。
 * モノトーン基調 ＋ アクティブ項目に星のあしらい（大人カワイイ）。
 *
 * 使い方:
 *   - ルート全体に常設する場合: app/_layout.tsx で <GlobalMenuBar />
 *     （筋トレ・認証・目標作成フローなどでは自動で非表示）
 *   - 個別に置く場合: <HomeMenuBar active="home" />
 * SafeArea の下端 inset はこのコンポーネント側で吸収します。
 */

import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonoColors, MonoGlyph, MonoLayout } from '@/constants/mono-theme';
import { tapLight } from '@/lib/haptics';

export type MenuKey = 'home' | 'goal' | 'friends' | 'settings';

type Item = {
  key: MenuKey;
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  route: string;
};

const ITEMS: Item[] = [
  { key: 'home', label: 'ホーム', icon: 'home', route: '/(tabs)' },
  { key: 'goal', label: '目標', icon: 'flag', route: '/goal' },
  { key: 'friends', label: 'フレンド', icon: 'users', route: '/friends' },
  { key: 'settings', label: '設定', icon: 'settings', route: '/settings' },
];

/** このバーを表示しない画面（前方一致）。筋トレ中と、集中させたいフロー。 */
const HIDDEN_PREFIXES = [
  '/workout',
  '/auth',
  '/modal',
  '/goal/create',
  '/goal/questions',
  '/goal/generating',
  '/_sitemap',
  '/+not-found',
];

function activeFromPath(pathname: string): MenuKey | null {
  if (pathname.startsWith('/goal')) return 'goal';
  if (pathname.startsWith('/friends')) return 'friends';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname === '/' || pathname.startsWith('/(tabs)')) return 'home';
  return null;
}

export function HomeMenuBar({ active }: { active?: MenuKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const current = active ?? activeFromPath(pathname);

  const go = (item: Item) => {
    if (item.key === current) return;
    tapLight();
    if (item.key === 'home') {
      router.replace(item.route as never);
    } else {
      router.push(item.route as never);
    }
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {ITEMS.map((item) => {
        const isActive = item.key === current;
        return (
          <Pressable
            key={item.key}
            style={styles.item}
            onPress={() => go(item)}
            hitSlop={6}>
            <Text style={styles.star}>{isActive ? MonoGlyph.star : ' '}</Text>
            <Feather
              name={item.icon}
              size={20}
              color={isActive ? MonoColors.ink : MonoColors.textMuted}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * ルート全体に常設するメニューバー。
 * 筋トレ画面・認証・目標作成フロー・モーダルなどでは自動的に非表示。
 */
export function GlobalMenuBar() {
  const pathname = usePathname();
  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
  if (hidden) return null;
  return <HomeMenuBar />;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: MonoColors.surface,
    borderTopWidth: 1,
    borderTopColor: MonoColors.border,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  star: {
    fontSize: 9,
    lineHeight: 10,
    color: MonoColors.accent,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: MonoColors.textMuted,
    letterSpacing: 0.5,
  },
  labelActive: {
    color: MonoColors.ink,
  },
});

export const MENU_BAR_MIN_HEIGHT = MonoLayout.gap; // レイアウト調整用の目安値
