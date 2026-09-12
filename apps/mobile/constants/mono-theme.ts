/**
 * モノトーン基調のUIトークン（認証・設定まわり）。
 * -------------------------------------------------------------
 * 黒・白・グレーを基調に、ワンポイントで "greige rose" のアクセントと
 * 星（★ / ✦ / ✨）・リボン（🎀）のグラフィックをさりげなく添える
 * 「大人カワイイ」テイスト。色を調整したいときはここだけ触ればOK。
 */

export const MonoColors = {
  /** 画面の地（ほんのり温かいオフホワイト） */
  screenBg: '#F6F5F4',
  /** カード・入力面（白） */
  surface: '#FFFFFF',
  /** 一段沈めた面（淡いグレー） */
  surfaceAlt: '#F0EEED',

  /** 主要テキスト・主ボタン（ソフトブラック） */
  ink: '#1A1A1A',
  /** 見出し補助 */
  inkSoft: '#3D3A38',
  /** 補助テキスト */
  textSecondary: '#6B6764',
  /** ヒント・プレースホルダー */
  textMuted: '#A8A29E',
  /** ボタン上の文字（白） */
  onInk: '#FFFFFF',

  /** ボーダー・仕切り */
  border: '#E4E1DF',
  /** フォーカス時のボーダー */
  borderStrong: '#1A1A1A',

  /** ワンポイントのアクセント（くすみローズ、やや濃いめ） */
  accent: '#C2685F',
  /** アクセントの淡い塗り（ピル・選択ハイライト） */
  accentTint: '#F5E2DF',

  /** 破壊的アクション（退会など）。赤みを抑えたスモークレッド */
  danger: '#A85E5E',
  dangerTint: '#F4EAEA',

  /** 達成・完了サイン。モノトーンの中でも一目で分かるよう控えめなセージグリーン */
  success: '#5E8C61',
  successTint: '#E9F1E7',
  /** 今週の目標カード用の、薄めでかわいいグリーン */
  successSoft: '#8FBB8A',
} as const;

export const MonoLayout = {
  radiusCard: 20,
  radiusControl: 14,
  radiusPill: 999,
  screenPadding: 24,
  gap: 16,
} as const;

/** さりげなく散らす装飾グリフ */
export const MonoGlyph = {
  star: '✦',
  sparkle: '✨',
  ribbon: '🎀',
} as const;
