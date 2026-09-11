# Supabase セットアップ（完成版・手順）

## 実行するもの — これだけ

1. **SQL**:
   - 初回: `supabase/schema.sql` を Supabase ダッシュボード > SQL Editor に貼って Run
     （既存の `users` / `friendships` / `workout_logs` への差分適用。再実行しても安全）
   - 既に schema.sql 実行済みなら追加で以下も Run（すべて schema.sql 側に反映済み・再実行可）
     - `supabase/migration_02_avatar_emoji.sql`（アバター絵文字を `users` に持たせフレンド一覧にも表示）
     - `supabase/migration_03_home_stats.sql`（`workout_logs.duration_sec` 追加＋ホーム画面の実績 RPC `get_home_stats`）
     - `supabase/migration_04_friend_code.sql`（表示名の一意制約を撤廃＋`users.friend_code` 導入。フレンド申請はコードのみ）
     - `supabase/migration_05_friends_include_self.sql`（`get_friends_with_status` に自分自身の行も含める）
     - `supabase/migration_06_goal_roadmap.sql`（目標ロードマップの永続化。`goal_trees`/`goal_milestones`/`goal_tasks` ＋ `save_roadmap`/`get_current_roadmap`。※ Supabase 上には既に作成済みのはずだが、リポジトリに無かったため反映）
     - `supabase/migration_07_this_week_focus.sql`（ホーム画面の「今週の目標」用 RPC `get_this_week_focus`）
2. **パッケージ**: 導入済み
   ```bash
   npx expo install @react-native-async-storage/async-storage
   ```
3. **アプリ側コード**: 下記のファイルがすでに `schema.sql` に合わせて実装済み
   - `supabase.tsx` … RN 用クライアント（AsyncStorage 永続化）
   - `services/authService.ts` … `signUp` / `signIn` / `signOut` / `updateProfile` / `getAccount` / `updateAccount` / `deleteAccount`
   - `services/friendsService.ts` … `getFriendsWithWorkoutStatus` / `getIncomingFriendRequests` / `sendFriendRequest` / `acceptFriendRequest` / `rejectFriendRequest` / `subscribeToPresence` / `subscribeToFriendRequests`
   - `types/db.ts` … `AppUser` / `Friendship` / RPC 行の型
   - 画面: `app/auth.tsx` / `app/settings.tsx` / `app/(tabs)/index.tsx` / `app/friends.tsx`

## SQL を実行する前の確認

`schema.sql` は次を前提にしています。違う場合は先に調整が必要です。

- [ ] `users.id` = `auth.users.id`（Supabase 標準）
- [ ] `friendships.user_id_a` = 申請者 / `user_id_b` = 申請された側
- [ ] `workout_logs` の1行 = 運動1回（`created_at` を実施日時として集計）
- [ ] 既存 `friendships.status` の値が `pending` / `accepted` / `rejected` のみ
- [ ] `users` 行を作る**既存トリガーの有無**（あれば `handle_new_user` は重複するので統合）

## schema.sql が変更する内容

| テーブル | 変更 |
|---|---|
| `users` | `is_online` `last_seen` `avatar_emoji` `friend_code` 追加 / 各種既定値 / `friend_code` 自動採番＋一意Index（`name` は重複OK）/ `updated_at`トリガー / signup時の`handle_new_user`トリガー |
| `friendships` | `status` CHECK(3値) / `updated_at` 追加 / 自己参照禁止 / A↔B重複防止Index / FK補完 |
| `workout_logs` | 集計用Index / **RLS有効化** |
| （新規）`user_workout_stats` ビュー | 連続日数・お休み日数・自己ベスト（JST暦日） |
| （新規）RPC 6本 | フレンド申請/応答/一覧/受信一覧/presence/アカウント削除 |

### ⚠️ workout_logs の RLS について

RLS 有効化後は **ログイン中ユーザーの id で INSERT** する必要があります。
`services/workoutService.ts` の `saveWorkoutSession` は現在ダミーの固定 `user_id`
（`'00000000-...'`）で INSERT しているため、次のように直してください:

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) throw new Error('AUTH_REQUIRED');
await supabase.from('workout_logs').insert({ user_id: user.id, menu_id: menuId });
```

## Auth 設定（ダッシュボード > Authentication）

1. **Providers > Email** を有効化
2. **Confirm email**:
   - 開発中は OFF（確認なしで即ログイン、動作確認が速い）
   - 本番は ON ＋ **URL Configuration > Redirect URLs** にディープリンク
     （`app.json` の `scheme` を確認。例 `zubora://auth-callback`）
3. `signUp` は `options.data` に `name` / `preferred_time_of_day`（`'HH:MM'`）を渡すだけ。
   `handle_new_user` トリガーが `users` 行を作り、`friend_code` は列 default が自動採番します。
   表示名（`name`）は重複OK。フレンド申請は `friend_code`（例 `ZBR-8A2K7X`）で行います。

## Realtime 設定（ダッシュボード > Database > Replication）

`schema.sql` が `supabase_realtime` に `friendships` / `users` を追加済み。
両テーブルの Realtime が ON か確認してください。

- **オンライン状況**: `subscribeToPresence()` が `channel('online-users')` で在席を
  `track()`（即時・DB不要）。入退室時に `update_my_presence` RPC で `users.is_online`
  も更新するので、`subscribeToFriendPresenceRows()` の postgres_changes 購読も併用可。
- **申請の受信**: `subscribeToFriendRequests()` が `friendships`（`user_id_b = 自分`）
  の変更を購読。

RLS は Realtime にも効くため、購読側は「自分が SELECT できる行」の変更しか受信しません。

## 継続日数 / お休み日数（`user_workout_stats`）

- `workout_logs`（`user_id` あり）を **JST暦日**で集計
- `streak_days`: 直近の連続実施ランが「今日 or 昨日」に接していれば、その長さ。途切れれば 0
- `rest_days`: 最終実施日からの経過日数（今日やれば 0 / 記録なしは null）
- `best_streak_days`: 過去最長
- タイムゾーンは `schema.sql` 内の `'Asia/Tokyo'` を変更

自分の分だけなら直接:

```sql
select * from public.user_workout_stats where user_id = auth.uid();
```

フレンドの分は `get_friends_with_status()` RPC 経由（SECURITY DEFINER）。

## 使用例

```ts
import { signUp, signIn, signOut, getAccount, updateAccount } from '@/services/authService';
import {
  getFriendsWithWorkoutStatus,
  getIncomingFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  subscribeToPresence,
  subscribeToFriendRequests,
} from '@/services/friendsService';

await signUp({ email, password, name: 'ゆるトレ子', preferredTimeOfDay: '21:00' });
await signIn(email, password);
const account = await getAccount();                 // { email, name, avatarEmoji }
await updateAccount({ name: '新しい名前', avatarEmoji: '🎀' });
await signOut();

const friends  = await getFriendsWithWorkoutStatus(); // 継続日数順
const requests = await getIncomingFriendRequests();

const res = await sendFriendRequest('ZBR-8A2K7X'); // 相手のフレンドコード
if (!res.ok) console.log(res.reason); // 'not_found' | 'already_friend' | 'already_requested' | 'self'
await acceptFriendRequest(requestId);
await rejectFriendRequest(requestId);

useEffect(() => subscribeToPresence(setOnline), []);
useEffect(() => subscribeToFriendRequests(() => refetch()), []);
```
