/**
 * DepletingBar — 残り時間に応じて減っていく横バー。
 * progress（0〜1）を渡すと、その割合ぶんだけ塗りが縮みます。
 */

import { WorkoutColors } from '@/constants/workout-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface DepletingBarProps {
  /** 残り割合。1 = 満タン、0 = 空 */
  progress: number;
  /** バーの太さ */
  height?: number;
  /** 下地の色 */
  trackColor?: string;
  /** 塗りの色 */
  fillColor?: string;
}

export function DepletingBar({
  progress,
  height = 12,
  trackColor = WorkoutColors.border,
  fillColor = WorkoutColors.primary,
}: DepletingBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={[styles.track, { height, backgroundColor: trackColor }]}>
      <View
        style={[
          styles.fill,
          { width: `${clamped * 100}%`, backgroundColor: fillColor },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
});
