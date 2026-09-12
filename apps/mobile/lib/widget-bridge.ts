/**
 * iOS ホーム画面ウィジェットへの共有データ受け渡し。
 * ------------------------------------------------------------------
 * ウィジェット（targets/widget/）は Swift で動くため JS を実行できない。
 * App Group の共有 UserDefaults を経由して値を渡す。
 *   - App Group 名は app.json の ios.entitlements と
 *     targets/widget/expo-target.config.js / widgets.swift と一致させること。
 *   - iOS 以外（Android / web / Expo Go）では no-op。
 */
import { Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';

const APP_GROUP = 'group.com.zubora.workout';

/**
 * リマインド時刻（時, 0-23）。ウィジェット背景がこの時刻に近づくとティールへ寄る。
 * TODO(notifications): 通知設定画面ができたら、そこで保存した値を供給する。
 */
export const DEFAULT_REMINDER_HOUR = 19;

const storage =
  Platform.OS === 'ios' ? new ExtensionStorage(APP_GROUP) : null;

export type WidgetSnapshot = {
  /** 連続達成日数 */
  streakDays?: number;
  /** 最後に筋トレした日時（ISO 文字列）。未実施なら null。 */
  lastWorkoutAt?: string | null;
  /** リマインド時刻（時） */
  reminderHour?: number;
};

/**
 * ウィジェットに表示する状態を書き込み、再描画を要求する。
 * 渡したキーだけ更新する（例: 起動時は streakDays だけ、筋トレ完了時は全部）。
 */
export function pushWidgetSnapshot(snap: WidgetSnapshot): void {
  if (!storage) return;
  try {
    if (snap.streakDays != null) {
      storage.set('streakDays', Math.max(0, Math.round(snap.streakDays)));
    }
    if (snap.lastWorkoutAt !== undefined) {
      storage.set('lastWorkoutAt', snap.lastWorkoutAt ?? '');
    }
    if (snap.reminderHour != null) {
      storage.set('reminderHour', snap.reminderHour);
    }
    ExtensionStorage.reloadWidget();
  } catch (err) {
    console.warn('[widget-bridge] スナップショット書き込みに失敗:', err);
  }
}
