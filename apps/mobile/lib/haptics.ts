/** ボタン用の触覚フィードバック。Web では自動的に無効。 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** 主要アクション（スタート等）の中程度の振動 */
export function tapImpact() {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** 補助アクション（一時停止等）の軽い振動 */
export function tapLight() {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** 完了時の成功フィードバック */
export function notifySuccess() {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
