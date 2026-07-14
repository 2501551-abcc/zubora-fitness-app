/**
 * DrumRollPicker — ドラムロール式（スロットのように回る）の時間ピッカー。
 *
 * 縦スクロールで項目が中央にスナップし、中央の項目が選択値になります。
 * 中央から離れるほど薄く・小さくなり、ドラムが回っているような見た目になります。
 *
 * 汎用コンポーネントなので、時間以外の選択にも使い回せます。
 */

import { WorkoutColors, WorkoutLayout } from '@/constants/workout-theme';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const ITEM_HEIGHT = WorkoutLayout.drumItemHeight;
const VISIBLE = WorkoutLayout.drumVisibleCount; // 奇数
const CENTER_OFFSET = Math.floor(VISIBLE / 2);

export interface DrumRollItem {
  /** 実際の値（例: 分数） */
  value: number;
  /** 表示ラベル（例: "15分"） */
  label: string;
}

interface DrumRollPickerProps {
  items: DrumRollItem[];
  /** 現在選択中の value */
  selectedValue: number;
  /** 選択が確定（スナップ完了）したときに呼ばれる */
  onValueChange: (value: number) => void;
}

export function DrumRollPicker({ items, selectedValue, onValueChange }: DrumRollPickerProps) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const listRef = useRef<Animated.FlatList<DrumRollItem>>(null);

  const initialIndex = useMemo(() => {
    const i = items.findIndex((it) => it.value === selectedValue);
    return i < 0 ? 0 : i;
  }, [items, selectedValue]);

  // スクロール停止時に、中央に来た項目を選択値として確定する
  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      const next = items[clamped];
      if (next && next.value !== selectedValue) {
        // スナップで選択が変わったら軽い触覚フィードバック（Webでは無効）
        if (Platform.OS !== 'web') {
          void Haptics.selectionAsync();
        }
        onValueChange(next.value);
      }
    },
    [items, selectedValue, onValueChange],
  );

  const containerHeight = ITEM_HEIGHT * VISIBLE;

  return (
    <View style={[styles.container, { height: containerHeight }]}>
      {/* 中央の選択ハイライト帯 */}
      <View
        pointerEvents="none"
        style={[
          styles.selectionBand,
          { top: CENTER_OFFSET * ITEM_HEIGHT, height: ITEM_HEIGHT },
        ]}
      />

      <Animated.FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => String(item.value)}
        showsVerticalScrollIndicator={false}
        bounces={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        contentContainerStyle={{ paddingVertical: CENTER_OFFSET * ITEM_HEIGHT }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumEnd}
        renderItem={({ item, index }) => (
          <DrumRollRow item={item} index={index} scrollY={scrollY} />
        )}
      />
    </View>
  );
}

interface RowProps {
  item: DrumRollItem;
  index: number;
  scrollY: Animated.Value;
}

/** 各行。中央からの距離に応じて opacity / scale を補間してドラム感を出す。 */
function DrumRollRow({ item, index, scrollY }: RowProps) {
  const inputRange = [
    (index - 2) * ITEM_HEIGHT,
    (index - 1) * ITEM_HEIGHT,
    index * ITEM_HEIGHT,
    (index + 1) * ITEM_HEIGHT,
    (index + 2) * ITEM_HEIGHT,
  ];

  const opacity = scrollY.interpolate({
    inputRange,
    outputRange: [0.25, 0.55, 1, 0.55, 0.25],
    extrapolate: 'clamp',
  });
  const scale = scrollY.interpolate({
    inputRange,
    outputRange: [0.8, 0.9, 1.15, 0.9, 0.8],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[styles.row, { opacity, transform: [{ scale }] }]}>
      <Text style={styles.rowText}>{item.label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  selectionBand: {
    position: 'absolute',
    left: 24,
    right: 24,
    borderRadius: WorkoutLayout.radiusControl,
    backgroundColor: WorkoutColors.mist,
  },
  row: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    fontSize: 26,
    fontWeight: '600',
    color: WorkoutColors.textPrimary,
  },
});
