# スクワット解析 統合ガイド

`cv/pose` のフォーム判定ロジックを、実アプリ（`apps/mobile`）から
「メニューを選んで呼び出す」形で組み込みました。

**方針**: フォーム判定に関するファイル（TSロジック・モデルファイル）は全て `cv/pose` に集約し、
`apps/mobile` 側は「それを画面から呼び出すための最小限の配線」だけを追加しています。

---

## フロー

```
ホーム画面「筋トレを始める」
  → メニュー選択画面（/workout/menu）※DBから取得
    → 「スクワット」を選択
      → フォーム判定画面（/workout/pose-analysis）※ロジックはcv/poseを直接参照
        → 正しいフォームが10回貯まったら自動終了
          → 結果をworkout_logsに保存 → 結果一覧を表示
```

---

## 変更ファイル一覧（担当者ごと）

### 🟢 `cv/`（あなたの担当フォルダ）— ここに集約

| ファイル | 状態 |
|---|---|
| `cv/pose/exerciseConfig.ts` | **更新**（これまでの実機テストで詰めた最新版：向きの指示・しきい値・すね判定廃止など） |
| `cv/pose/PoseFormEvaluator.ts` | **更新**（READYの再アナウンス抑制・発話の割り込み防止・最小深度カウントなど） |
| `cv/pose/App.tsx` | **更新**（単体テスト用アプリも最新ロジックに追従させただけ。実アプリはこのファイルを使わない） |
| `cv/pose/pose_landmarker_full.task` | 変更なし。実アプリもこのファイルを直接参照する（複製は作っていない） |

`cv/pose/pc_test.html`, `pose_check.py`, `pose_webcam.py`, `ideal_squat.jpg` は触っていません。

### 🟡 `apps/mobile/supabase/`（DBマイグレーション。既存の置き場所に追従）

| ファイル | 状態 |
|---|---|
| `apps/mobile/supabase/migration_03_workout_menus.sql` | **新規**。`migration_02_avatar_emoji.sql`と同じ形式・命名で追加 |
| `apps/mobile/supabase/SETUP.md` | **1箇所だけ追記**。実行手順に上記マイグレーションの案内を1行追加 |

**設計判断**: pose判定の結果を保存する専用テーブルは作らず、既存の`workout_logs`に
`total_reps` / `good_reps` / `rep_log`の3列を追加する形にしました。これにより:
- 既存の連続日数集計（`user_workout_stats`ビュー）にスクワットの実施も自動で乗る
- 既存のRLS（本人 / フレンドだけ閲覧可）をそのまま使い回せる（新規ポリコシー不要）

`workout_menus`テーブルは`schema.sql`のコメントで「既存テーブル」前提として触れられていましたが、
実体を定義するSQLがリポジトリ内に見当たらなかったため、このマイグレーションで
作成/不足カラム補完の両方に対応する形にしています（`create table if not exists` +
`alter table add column if not exists`。既に別の形で存在していても安全です）。

### 🔴 `apps/mobile/`（他の担当者の領域。変更は最小限に絞った）

**新規追加（既存ファイルへの影響なし）**

| ファイル | 内容 |
|---|---|
| `apps/mobile/app/workout/menu.tsx` | メニュー選択画面 |
| `apps/mobile/app/workout/pose-analysis.tsx` | フォーム判定画面。ロジックは`cv/pose`を相対パスで直接importしている |
| `apps/mobile/metro.config.js` | Metroが`apps/mobile`の外（`cv/pose`）のファイルを解決できるようにする設定 |
| `apps/mobile/babel.config.js` | `react-native-vision-camera`のフレーム処理に必要な`react-native-worklets-core`プラグインの設定 |
| `apps/mobile/plugins/withPoseModel.js` | `cv/pose`のモデルファイルをビルド時にXcodeへ自動同梱するExpo設定プラグイン |

**既存ファイルの編集（差分は小さいですが、必ず確認してください）**

| ファイル | 変更内容 |
|---|---|
| `apps/mobile/app/(tabs)/index.tsx` | 「筋トレを始める」ボタンの遷移先を `/workout/prepare` → `/workout/menu` に変更（1行） |
| `apps/mobile/app/_layout.tsx` | `workout/menu` と `workout/pose-analysis` の2画面をStack.Screenとして追加登録 |
| `apps/mobile/types/workout.ts` | `WorkoutMenuItem` / `PoseRepLog` / `PoseAnalysisResult` 型を追加（既存の型は変更なし） |
| `apps/mobile/services/workoutService.ts` | `fetchWorkoutMenus()` と `savePoseAnalysisResult()` の2関数を追加（既存の関数・`saveWorkoutSession`と同じ認証パターンに合わせた） |
| `apps/mobile/app.json` | `ios.infoPlist.NSCameraUsageDescription`、`android.permissions: ["CAMERA"]`、`plugins`に`react-native-vision-camera`と`./plugins/withPoseModel.js`を追加 |
| `apps/mobile/package.json` | `react-native-vision-camera` / `react-native-mediapipe` / `react-native-worklets-core` / `expo-speech` / `expo-dev-client` を依存関係に追加 |

`apps/mobile/lib/`, `components/`, `services/authService.ts`, `services/friendsService.ts`,
`services/goalService.ts`, `types/db.ts`, `types/friends.ts`, `types/goal.ts` は一切変更していません。

---

## 1. DBのセットアップ

Supabaseダッシュボード → SQL Editor で、`SETUP.md`の手順に沿って
`schema.sql` → (必要なら)`migration_02_avatar_emoji.sql` → `migration_03_workout_menus.sql`
の順に実行してください（`schema.sql`まで実行済みなら`migration_03`だけでOKです）。

メニューを増やしたいときは、`migration_03`の`insert into workout_menus (...)`と
同じ形で行を追加するだけです（`analysis_type = 'pose'`にする場合、`exercise_key`が
`cv/pose/exerciseConfig.ts`の`EXERCISE_CONFIGS`にも存在している必要があります。今は`'squat'`のみ）。

## 2. ビルド手順

```bash
cd apps/mobile
npm install
npx expo install --fix   # Expo SDK 57 に対して依存バージョンを自動調整
npx expo prebuild -p ios
npx expo run:ios --device
```

モデルファイルは`cv/pose`から直接参照するので、コピー作業は不要です。

---

## ⚠️ 事前に知っておいてほしいリスク

このプロジェクトはExpo SDK 57 / React Native 0.86という、かなり新しい構成です。
以下は実際にビルドしてみないと確証が持てない部分なので、正直に共有します。

1. **New Architecture 必須化**: Expo SDK 55以降はNew Architectureのみで動作し、
   Legacy Architectureは選択できません。`react-native-vision-camera`と
   `react-native-mediapipe`（特に後者は更新頻度が高くないコミュニティ製ライブラリ）が
   この組み合わせで問題なく動くかは、実際にビルドするまで分かりません。
   `npx expo install --fix`実行後、`npx expo-doctor`でも確認してみてください。

2. **Metroのフォルダ横断参照**: `apps/mobile`から`cv/pose`を直接importする構成は、
   `metro.config.js`の`watchFolders`設定に依存しています。追加済みですが、
   `Unable to resolve module`のようなエラーが出た場合はまずここを疑ってください。

3. **worklets系パッケージの競合**: このプロジェクトは`react-native-reanimated` 4.x
   （`react-native-worklets`パッケージ、現在0.10.1）が入っており、今回追加した
   `react-native-vision-camera`のフレーム処理は別系統の`react-native-worklets-core`を
   必要とします。この2つが同居すると、Android側でクラス名衝突によるビルドエラーが
   起きる既知の問題が報告されています（vision-camera公式リポジトリのIssue #3563）。
   iOS単体でのテストであれば今のところ問題は報告されていません。

---

## 3. 動作確認したいポイント

1. ホーム画面「筋トレを始める」→ メニュー画面に「スクワット」が表示される
2. 「スクワット」をタップ → カメラが起動し、フォーム判定が始まる
3. 正しいフォームで10回行うと「お疲れさまでした」→ 結果一覧 → 「メニューに戻る」
4. Supabaseの`workout_logs`テーブルに、`menu_id` / `total_reps` / `good_reps` / `rep_log`
   が入った行が1つ増えているか確認（未ログイン状態だと保存はスキップされ、
   コンソールに警告が出ます。事前に`app/auth.tsx`からログインしておいてください）
