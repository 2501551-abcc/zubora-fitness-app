# iOS ホーム画面ウィジェット — 実装引継ぎ

対象アプリ: `apps/mobile`（Expo SDK 54 / Expo Router / CNG）
実装日: 2026-09-01
検証環境: iPhone 17 シミュレータ (iOS 26.5) / Xcode 26.6

このドキュメントは「連続記録ウィジェット」の追加と、それに伴うビルド修復の内容をまとめたもの。

---

## 0. TL;DR

- チームメイトの通知テスト用コミットで壊れていた **ビルドを修復**した。
- **iOS ホーム画面ウィジェット**（連続日数を表示、タップで即 `workout/prepare` へ）を Swift/WidgetKit + `@bacons/apple-targets` で追加。
- RN → ウィジェットのデータ受け渡しは **App Group の共有 UserDefaults** 経由（`lib/widget-bridge.ts`）。
- シミュレータで **ビルド成功・ウィジェット表示・データ連携・ディープリンク** すべて確認済み。
- **Android ウィジェット / 通知設定画面は未対応**（別トラック。§6 参照）。

---

## 1. ビルド修復（先に必要だった作業）

| ファイル | 変更内容 |
|---|---|
| `app.json` | **括弧崩れを修正**。`plugins` / `experiments` が `expo` オブジェクトの外に出ていて、`expo-router` / `expo-splash-screen` プラグインも `typedRoutes` / `reactCompiler` もすべて無視されていた（commit `a641b6d`）。正しい位置に戻した。 |
| `app/workout/prepare.tsx` | `Platform` の import 追加（未 import で Android パス実行時にクラッシュしていた）。未使用の `import { supabase } from '../../../supabase'`（パスも誤り）を削除。`setNotificationHandler` を Expo SDK 54 形（`shouldShowAlert` → `shouldShowBanner` / `shouldShowList`）へ更新。**通知スケジュール処理などの挙動は変えていない**。 |
| `package.json` / `package-lock.json` | `npm install`（`expo-notifications` が manifest にあるのに未インストールだった）。`expo install expo-notifications @bacons/apple-targets expo-build-properties` を追加。 |

確認: `npx tsc --noEmit` エラー0 / `npm run lint` エラー0（既存の warning 2件のみ、今回の変更とは無関係）。

---

## 2. 追加した依存

```
@bacons/apple-targets    ^5.0.0   # Apple ターゲット（ウィジェット）を CNG のまま生成する Config Plugin
expo-build-properties     ~1.0    # iOS deploymentTarget を 16.4 に上げるため（§5 のハマりどころ参照）
expo-notifications        ~0.32   # もともと manifest にあったが未インストールだった。今回 plugin も app.json に追加
```

---

## 3. app.json の変更点（ウィジェット関連）

```jsonc
"ios": {
  "bundleIdentifier": "com.zubora.workout",   // ← 新規（prebuild 必須）
  "appleTeamId": "V65BHV5H9C",                // ← rintaro 個人 Apple Team。他 Mac でビルドする人は各自のに差し替え
  "entitlements": {
    "com.apple.security.application-groups": ["group.com.zubora.workout"]  // ← ウィジェットとの共有領域
  }
},
"android": {
  "package": "com.zubora.workout"             // ← 新規（prebuild 必須）
},
"plugins": [
  "expo-router",
  ["expo-splash-screen", { ... }],
  ["expo-notifications", { "color": "#1D9E75" }],   // ← 新規
  "@bacons/apple-targets",                          // ← 新規
  ["expo-build-properties", { "ios": { "deploymentTarget": "16.4" } }]  // ← 新規
]
```

> **注意**: `appleTeamId` は個人の Apple Developer チーム ID をそのまま入れている。チームで共有リポジトリなので、本来は `app.config.js` + 環境変数にするのが望ましい（フォローアップ候補）。

---

## 4. 追加/変更したファイル

### 新規: `targets/widget/`（ウィジェットの Swift ソース。git 管理対象）

| ファイル | 役割 |
|---|---|
| `expo-target.config.js` | ターゲット定義。`type: "widget"`、表示名「ズボラ筋トレ」、色トークン `$accent` `#1D9E75` / `$widgetBackground` `#F4F7F5`、App Group を app.json からミラー。 |
| `index.swift` | `@main` の `WidgetBundle`。`ZuboraStreakWidget` のみ export。 |
| `widgets.swift` | 本体。`TimelineProvider` + SwiftUI View。詳細は下記。 |
| `Info.plist` | `create-target` 生成のまま（WidgetKit extension point）。 |

> `create-target widget` が生成した `WidgetControl.swift` / `WidgetLiveActivity.swift` / `AppIntent.swift`（コントロールウィジェット・ライブアクティビティ・設定可能パラメータ）は**削除済み**。今回はシンプルな静的ウィジェットのみ。

**`widgets.swift` の中身**
- `WidgetData.load()` — `UserDefaults(suiteName: "group.com.zubora.workout")` から `streakDays`(Int) / `lastWorkoutAt`(ISO文字列) / `reminderHour`(Int, 既定19) を読む。ISO は小数秒あり/なし両対応。
- `Provider` (`TimelineProvider`) — 今から8時間先まで30分刻みのエントリを生成し、`reminderHour` に近づくほど背景を `$accent`（ティール）へ補間（`tintProgress` 0→1）。当日すでに筋トレ済み（`lastWorkoutAt` が今日）なら `tintProgress` を 0 に固定して「完了」表示。`.after(4時間後)` で再生成。
- `ZuboraStreakWidgetView` — `🔥 {n}日連続`（0日なら「はじめよう」）＋サブコピー（`今日はもう完了！えらい` / `そろそろ動く時間だよ` / `タップで即スタート`）。`.containerBackground` に補間色。`.widgetURL(URL(string: "mobile://workout/prepare"))`。
- `ZuboraStreakWidget` — `StaticConfiguration`、`.systemSmall` / `.systemMedium` 対応。
- `// TODO(friends):` — フレンド機能のバックエンドができたら「フレンドが筋トレ中」を追加する箇所をコメントで明示。

### 新規: `lib/widget-bridge.ts`

RN → ウィジェットのブリッジ。`@bacons/apple-targets` の `ExtensionStorage` の薄いラッパ。

```ts
export const DEFAULT_REMINDER_HOUR = 19;  // TODO(notifications): 通知設定画面ができたらそこから供給
export function pushWidgetSnapshot(snap: {
  streakDays?: number; lastWorkoutAt?: string | null; reminderHour?: number;
}): void
```

- iOS 以外（Android / web / Expo Go）は **no-op**（`lib/haptics.ts` と同じ方針）。
- 渡したキーだけ更新する（起動時は `streakDays` だけ、筋トレ完了時は全部）。
- 書き込み後に `ExtensionStorage.reloadWidget()` を呼ぶ。

### 変更: `app/_layout.tsx`

起動時に `useEffect` で `fetchStreakDays()` → `pushWidgetSnapshot({ streakDays, reminderHour })`。

### 変更: `services/workoutService.ts`

`saveWorkoutSession()` の末尾（Supabase 保存の後）で `fetchStreakDays()` → `pushWidgetSnapshot({ streakDays, lastWorkoutAt: result.endedAt, reminderHour })`。
**関数シグネチャは変更なし**（バックエンド契約は維持）。

### ディープリンク

Expo Router がスキーム `mobile` を自動処理するため、ウィジェットの `mobile://workout/prepare` で `app/workout/prepare.tsx` が直接開く。`_layout.tsx` などに追加コードは不要だった。

---

## 5. ハマりどころ（次に触る人向け）

1. **`ExtensionStorage` が autolink されない → deploymentTarget を上げる**
   `@bacons/apple-targets` の `ExtensionStorage` podspec は `ios 16.4` 必須。Expo のデフォルト（15.1）だと `use_expo_modules!` が「プラットフォーム非対応」として**黙ってスキップ**し、`pushWidgetSnapshot` が no-op スタブになる（エラーも出ない）。→ `expo-build-properties` で `ios.deploymentTarget: "16.4"` に。
   確認コマンド: `grep ExtensionStorage ios/Podfile.lock`（出れば OK）。

2. **`@bacons/apple-targets` は増分 prebuild に弱い**
   `targets/` や `app.json` を変えたら必ず `npx expo prebuild -p ios --clean`。`--clean` なしだと `Cannot read properties of undefined (reading 'removeFromProject')` で落ちる。

3. **`pod install` が locale で落ちる**
   `Unicode Normalization not appropriate for ASCII-8BIT`。→ `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install` を `ios/` で実行（または `~/.zprofile` に export）。`npx expo run:ios` 経由なら Expo CLI が面倒を見てくれるので基本は問題なし。

4. **Swift はホットリロード不可**。変更のたびにリビルド。

5. **iOS はウィジェット更新タイミングを制御する**。`reloadWidget()` を呼んでも即時反映されないことがある（数十秒〜）。

---

## 6. ビルド & 動作確認

```bash
cd apps/mobile
npx expo prebuild -p ios --clean     # ios/ を生成（targets/widget が Xcode プロジェクトに組み込まれる）
npx expo run:ios                     # dev client をビルドしてシミュレータ起動（初回は数分）
```

確認済み（iPhone 17 シミュレータ）:
- [x] `npx tsc --noEmit` / `npm run lint` クリーン
- [x] ビルド成功（`app` スキーム、widget.appex が埋め込まれる）
- [x] アプリ起動、ホーム画面に既存のリグレッションなし
- [x] ウィジェットギャラリーに「ズボラ筋トレ / 連続記録」が出る
- [x] 小ウィジェットが描画される（🔥 5日連続 / サブコピー / 時刻連動のティール背景）
- [x] App Group 経由でデータが渡る（`streakDays=5` `reminderHour=19` が共有 UserDefaults に書き込まれている）
- [x] ウィジェットタップ → アプリが `/workout/prepare`（15秒カウントダウン）で開く

確認方法メモ: 共有データは
`xcrun simctl get_app_container <UDID> com.zubora.workout group.com.zubora.workout`
→ `Library/Preferences/group.com.zubora.workout.plist` を `plutil -p` で確認できる。

---

## 7. スコープ外（フォローアップ）

- **通知設定画面**（ON/OFF・リマインド時刻ピッカー）と AsyncStorage 永続化 → JS 完結、チームメイト担当。できたら `DEFAULT_REMINDER_HOUR` をその設定値に置き換える（`lib/widget-bridge.ts` の `TODO(notifications):`）。
- **`users.preferred_time_of_day` / `notifications` テーブル / `POST /notifications/schedule`** のバックエンド連携。
- **Android ウィジェット**（`react-native-android-widget` などで別途）。
- **「フレンドが筋トレ中」インジケータ**の実データ（フレンド機能バックエンド待ち。`widgets.swift` の `TODO(friends):`）。
- **実機ビルド** — `appleTeamId` を各自のものに、App Group のプロビジョニングが必要。
- `app.json` の `appleTeamId` ハードコードを `app.config.js` + 環境変数へ。
- `app/workout/session.tsx` の未使用 `supabase` import（lint warning、別コミットのゴミ）。
