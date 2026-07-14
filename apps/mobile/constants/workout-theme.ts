/**
 * 筋トレ画面まわりの配色・寸法トークン。
 * モックアップのティール系デザインに合わせています。
 * 色を変えたいときは基本ここだけ触れば全画面に反映されます。
 */

export const WorkoutColors = {
  /** メインのティール（ボタン・アクセント） */
  primary: '#1D9E75',
  /** 濃いティール（集中モードの背景） */
  deep: '#04342C',
  /** 中間のティール（見出し・強調テキスト） */
  ink: '#0F6E56',
  /** 明るいティール（淡い背景・休憩画面） */
  mist: '#E1F5EE',
  /** バーの下地など */
  soft: '#9FE1CB',
  /** バーの進捗（明るめ） */
  accent: '#5DCAA5',

  /** 準備画面の背景 */
  screenBg: '#F4F7F5',
  surface: '#FFFFFF',
  textPrimary: '#04342C',
  textSecondary: '#5F6B66',
  textMuted: '#9AA5A0',
  /** 準備画面の白カード上の枠線 */
  border: '#E3ECE8',
} as const;

export const WorkoutLayout = {
  radiusCard: 22,
  radiusControl: 14,
  /** ドラムロール1項目の高さ */
  drumItemHeight: 56,
  /** ドラムロールに見せる項目数（奇数） */
  drumVisibleCount: 5,
} as const;
