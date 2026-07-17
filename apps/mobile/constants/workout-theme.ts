/**
 * アプリ全体の配色・寸法トークン（明るいティール基調）。
 * 色を変えたいときは基本ここだけ触れば全画面に反映されます。
 * ※ファイル名は歴史的に workout-theme のままですが、アプリ全体で参照しています。
 */

export const WorkoutColors = {
  /** ティール（メインのアクセント・ボタン） */
  primary: '#1D9E75',
  /** アクセント上に乗せる文字色（白） */
  onAccent: '#FFFFFF',
  /** 集中背景（筋トレ画面の濃いティール） */
  deep: '#04342C',
  /** 中間のティール（見出し・タグ文字） */
  ink: '#0F6E56',
  /** 明るいティール（淡い塗り・ピル・選択ハイライト） */
  mist: '#E1F5EE',
  /** 淡いティールのボーダー・仕切り */
  soft: '#9FE1CB',
  /** プログレスの塗りなど */
  accent: '#5DCAA5',

  /** 画面の地（オフホワイト） */
  screenBg: '#F4F7F5',
  /** カード面（白） */
  surface: '#FFFFFF',
  /** 主要テキスト */
  textPrimary: '#04342C',
  /** 補助テキスト */
  textSecondary: '#5F6B66',
  /** ヒント・キャプション */
  textMuted: '#9AA5A0',
  /** ボーダー */
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
