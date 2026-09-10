/**
 * 設定・アカウント情報画面（"/settings"）
 * -------------------------------------------------------------
 * ・プロフィール（フレンドから見える表示名・アイコン）の確認/変更
 * ・アカウント情報（メールアドレス・パスワード）の確認/変更
 * ・通知（受け取る / 希望時間帯）の確認/変更
 * ・ログイン / ログアウト / アカウント削除
 *
 * データ層は services/authService.ts（Supabase Auth + public.users）。
 * アバターは追加ライブラリ不要の絵文字プリセット。画像にする場合は
 * expo-image-picker を足して avatar_url を Supabase Storage に保存。
 */

import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MonoColors, MonoGlyph, MonoLayout } from '@/constants/mono-theme';
import { notifySuccess, tapImpact, tapLight } from '@/lib/haptics';
import {
  changeEmail,
  changePassword,
  deleteAccount,
  getAccountInfo,
  signOut,
  updateProfile,
  type AccountInfo,
} from '@/services/authService';

const AVATAR_PRESETS: string[] = ['✦', '✨', '🎀', '🤍', '🌙', '⭐️', '☕️', '🕊️'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 未ログイン（ゲスト）時に表示する内容。編集操作はログインへ誘導する。 */
const GUEST_ACCOUNT: AccountInfo = {
  userId: '',
  email: null,
  emailConfirmed: false,
  name: 'ゲスト',
  avatarEmoji: '✦',
  avatarUrl: null,
  preferredTimeOfDay: '20:00',
  notificationEnabled: true,
};

type Editing = null | 'profile' | 'email' | 'password' | 'time';

export default function SettingsScreen() {
  const router = useRouter();

  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggedOut, setLoggedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);

  // 未ログインでも設定画面は閲覧できる（ゲスト表示）。保存系だけログインへ誘導する。
  const isGuest = loggedOut || !account;
  const view = account ?? GUEST_ACCOUNT;

  const requireLogin = () => {
    tapLight();
    router.push('/auth');
  };

  const reload = async () => {
    const info = await getAccountInfo();
    if (!info) {
      setLoggedOut(true);
      setAccount(null);
    } else {
      setLoggedOut(false);
      setAccount(info);
    }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const info = await getAccountInfo();
        if (!active) return;
        if (!info) setLoggedOut(true);
        else setAccount(info);
      } catch {
        if (active) setLoggedOut(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /* ---------- 各種保存 ---------- */

  const saveProfile = async (name: string, emoji: string) => {
    if (isGuest) return requireLogin();
    if (name.trim().length < 2) {
      Alert.alert('入力エラー', '表示名は2文字以上で入力してください。');
      return;
    }
    setBusy(true);
    try {
      await updateProfile({ name: name.trim(), avatar_emoji: emoji });
      await reload();
      setEditing(null);
      notifySuccess();
    } catch (e) {
      Alert.alert('エラー', msg(e, '保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const saveEmail = async (newEmail: string) => {
    if (isGuest) return requireLogin();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail.trim())) {
      Alert.alert('入力エラー', 'メールアドレスの形式が正しくありません。');
      return;
    }
    setBusy(true);
    try {
      await changeEmail(newEmail);
      setEditing(null);
      Alert.alert(
        '確認メールを送信しました',
        '新しいアドレス宛のリンクをタップすると変更が確定します。',
      );
    } catch (e) {
      Alert.alert('エラー', msg(e, 'メールアドレスの変更に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (pw: string, pw2: string) => {
    if (isGuest) return requireLogin();
    if (pw.length < 6) {
      Alert.alert('入力エラー', 'パスワードは6文字以上で入力してください。');
      return;
    }
    if (pw !== pw2) {
      Alert.alert('入力エラー', '確認用パスワードが一致しません。');
      return;
    }
    setBusy(true);
    try {
      await changePassword(pw);
      setEditing(null);
      notifySuccess();
      Alert.alert('変更しました', 'パスワードを更新しました。');
    } catch (e) {
      Alert.alert('エラー', msg(e, 'パスワードの変更に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const saveTime = async (hhmm: string) => {
    if (isGuest) return requireLogin();
    if (!HHMM.test(hhmm)) {
      Alert.alert('入力エラー', '「20:30」のような形式で入力してください。');
      return;
    }
    setBusy(true);
    try {
      await updateProfile({ preferred_time_of_day: `${hhmm}:00` });
      await reload();
      setEditing(null);
      notifySuccess();
    } catch (e) {
      Alert.alert('エラー', msg(e, '保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const toggleNotify = async (value: boolean) => {
    if (isGuest || !account) return requireLogin();
    setAccount({ ...account, notificationEnabled: value });
    try {
      await updateProfile({ notification_enabled: value });
    } catch (e) {
      setAccount({ ...account, notificationEnabled: !value });
      Alert.alert('エラー', msg(e, '設定を保存できませんでした。'));
    }
  };

  const handleLogout = () => {
    tapLight();
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await signOut();
          } finally {
            setBusy(false);
            router.replace('/auth');
          }
        },
      },
    ]);
  };

  const handleDelete = () => {
    tapImpact();
    Alert.alert(
      'アカウントを削除',
      'すべての記録・フレンド関係が完全に削除されます。この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteAccount();
            } catch (e) {
              try {
                await signOut();
              } catch {
                /* noop */
              }
              Alert.alert(
                '削除リクエストを受け付けました',
                `ログアウトしました。\n（サーバー側でエラー: ${msg(e, '不明')}）`,
              );
            } finally {
              setBusy(false);
              router.replace('/auth');
            }
          },
        },
      ],
    );
  };

  /* ---------- 表示 ---------- */

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={MonoColors.ink} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ゲスト（未ログイン）バナー */}
        {isGuest && (
          <Pressable style={styles.guestBanner} onPress={requireLogin}>
            <Feather name="star" size={14} color={MonoColors.accent} />
            <Text style={styles.guestBannerText}>
              ゲストモードです。ログインすると記録の同期・フレンド機能・設定の保存ができます。
            </Text>
            <Text style={styles.guestBannerCta}>ログイン</Text>
          </Pressable>
        )}

        {/* プロフィール（フレンドから見える情報） */}
        <View style={styles.profileCard}>
          <Text style={styles.decoGlyphCorner}>{MonoGlyph.ribbon}</Text>
          <View style={styles.avatarRing}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarEmoji}>{view.avatarEmoji}</Text>
            </View>
          </View>
          <Text style={styles.name}>{view.name}</Text>
          <View style={styles.publicPill}>
            <Feather name="users" size={11} color={MonoColors.accent} />
            <Text style={styles.publicPillText}>フレンドに公開される情報</Text>
          </View>

          {editing === 'profile' && !isGuest ? (
            <ProfileEditor
              initialName={view.name}
              initialEmoji={view.avatarEmoji}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={saveProfile}
            />
          ) : (
            <Pressable
              style={styles.editLink}
              hitSlop={8}
              onPress={() => {
                if (isGuest) return requireLogin();
                tapLight();
                setEditing('profile');
              }}>
              <Feather name="edit-2" size={13} color={MonoColors.accent} />
              <Text style={styles.editLinkText}>プロフィールを編集</Text>
            </Pressable>
          )}
        </View>

        {/* アカウント情報（認証） */}
        <SectionLabel>アカウント情報</SectionLabel>
        <View style={styles.card}>
          <Row
            icon="mail"
            label="メールアドレス"
            value={view.email ?? '—'}
            badge={isGuest || view.emailConfirmed ? undefined : '未確認'}
            actionLabel={editing === 'email' ? undefined : '変更'}
            onAction={() => (isGuest ? requireLogin() : setEditing('email'))}
          />
          {editing === 'email' && !isGuest && (
            <SingleFieldEditor
              placeholder="new@email.com"
              keyboardType="email-address"
              busy={busy}
              submitLabel="確認メールを送る"
              onCancel={() => setEditing(null)}
              onSave={saveEmail}
            />
          )}

          <Divider />

          <Row
            icon="lock"
            label="パスワード"
            value="••••••••"
            actionLabel={editing === 'password' ? undefined : '変更'}
            onAction={() => (isGuest ? requireLogin() : setEditing('password'))}
          />
          {editing === 'password' && !isGuest && (
            <PasswordEditor
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={savePassword}
            />
          )}
        </View>

        {/* 通知 */}
        <SectionLabel>通知</SectionLabel>
        <View style={styles.card}>
          <View style={styles.row}>
            <Feather name="bell" size={18} color={MonoColors.inkSoft} />
            <Text style={styles.rowLabel}>通知を受け取る</Text>
            <Switch
              value={view.notificationEnabled}
              onValueChange={(v) => (isGuest ? requireLogin() : toggleNotify(v))}
              trackColor={{ true: MonoColors.ink, false: MonoColors.border }}
              thumbColor={MonoColors.surface}
            />
          </View>

          <Divider />

          <Row
            icon="clock"
            label="リマインド時間"
            value={view.preferredTimeOfDay}
            actionLabel={editing === 'time' ? undefined : '変更'}
            onAction={() => (isGuest ? requireLogin() : setEditing('time'))}
          />
          {editing === 'time' && !isGuest && (
            <SingleFieldEditor
              placeholder="20:30"
              keyboardType="numbers-and-punctuation"
              defaultValue={view.preferredTimeOfDay}
              maxLength={5}
              busy={busy}
              submitLabel="保存"
              onCancel={() => setEditing(null)}
              onSave={saveTime}
            />
          )}
        </View>

        {/* アカウント操作 */}
        <SectionLabel>アカウント</SectionLabel>
        <View style={styles.card}>
          {isGuest ? (
            <Pressable style={styles.row} onPress={requireLogin}>
              <Feather name="star" size={18} color={MonoColors.ink} />
              <Text style={[styles.rowLabel, styles.rowLabelStrong, { color: MonoColors.ink }]}>
                ログイン / 新規登録
              </Text>
              <Feather name="chevron-right" size={18} color={MonoColors.textMuted} />
            </Pressable>
          ) : (
            <>
              <Pressable style={styles.row} onPress={handleLogout} disabled={busy}>
                <Feather name="log-out" size={18} color={MonoColors.inkSoft} />
                <Text style={[styles.rowLabel, styles.rowLabelStrong]}>ログアウト</Text>
                <Feather name="chevron-right" size={18} color={MonoColors.textMuted} />
              </Pressable>
              <Divider />
              <Pressable style={styles.row} onPress={handleDelete} disabled={busy}>
                <Feather name="trash-2" size={18} color={MonoColors.danger} />
                <Text style={[styles.rowLabel, styles.rowLabelStrong, { color: MonoColors.danger }]}>
                  アカウントを削除
                </Text>
                <Feather name="chevron-right" size={18} color={MonoColors.textMuted} />
              </Pressable>
            </>
          )}
        </View>

        <Text style={styles.footNote}>{MonoGlyph.star} zubora fitness</Text>
      </ScrollView>

      {busy && (
        <View style={styles.overlay}>
          <ActivityIndicator color={MonoColors.onInk} />
        </View>
      )}
    </SafeAreaView>
  );
}

/* ============================================================
 * 小物
 * ========================================================== */

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable hitSlop={10} onPress={onBack}>
        <Feather name="chevron-left" size={24} color={MonoColors.ink} />
      </Pressable>
      <Text style={styles.headerTitle}>設定</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function Row({
  icon,
  label,
  value,
  badge,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  badge?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Feather name={icon} size={18} color={MonoColors.inkSoft} />
      <View style={styles.flex}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {badge && (
        <View style={styles.warnBadge}>
          <Text style={styles.warnBadgeText}>{badge}</Text>
        </View>
      )}
      {actionLabel && (
        <Pressable
          hitSlop={8}
          onPress={() => {
            tapLight();
            onAction?.();
          }}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ProfileEditor({
  initialName,
  initialEmoji,
  busy,
  onCancel,
  onSave,
}: {
  initialName: string;
  initialEmoji: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (name: string, emoji: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [emoji, setEmoji] = useState(initialEmoji);

  return (
    <View style={styles.editorBlock}>
      <Text style={styles.editorLabel}>表示名</Text>
      <TextInput
        style={styles.editorInput}
        value={name}
        onChangeText={setName}
        placeholder="表示名"
        placeholderTextColor={MonoColors.textMuted}
        autoFocus
        maxLength={20}
      />

      <Text style={styles.editorLabel}>アイコン</Text>
      <View style={styles.emojiGrid}>
        {AVATAR_PRESETS.map((g) => (
          <Pressable
            key={g}
            style={[styles.emojiOption, emoji === g && styles.emojiOptionActive]}
            onPress={() => {
              tapLight();
              setEmoji(g);
            }}>
            <Text style={styles.emojiOptionText}>{g}</Text>
          </Pressable>
        ))}
      </View>

      <EditorActions busy={busy} onCancel={onCancel} onSave={() => onSave(name, emoji)} />
    </View>
  );
}

function SingleFieldEditor({
  placeholder,
  keyboardType,
  defaultValue = '',
  maxLength,
  busy,
  submitLabel,
  onCancel,
  onSave,
}: {
  placeholder: string;
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  defaultValue?: string;
  maxLength?: number;
  busy: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <View style={styles.editorBlock}>
      <TextInput
        style={styles.editorInput}
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={MonoColors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={maxLength}
        autoFocus
      />
      <EditorActions
        busy={busy}
        saveLabel={submitLabel}
        onCancel={onCancel}
        onSave={() => onSave(value)}
      />
    </View>
  );
}

function PasswordEditor({
  busy,
  onCancel,
  onSave,
}: {
  busy: boolean;
  onCancel: () => void;
  onSave: (pw: string, pw2: string) => void;
}) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  return (
    <View style={styles.editorBlock}>
      <TextInput
        style={styles.editorInput}
        value={pw}
        onChangeText={setPw}
        placeholder="新しいパスワード（6文字以上）"
        placeholderTextColor={MonoColors.textMuted}
        secureTextEntry
        autoCapitalize="none"
        autoFocus
      />
      <TextInput
        style={styles.editorInput}
        value={pw2}
        onChangeText={setPw2}
        placeholder="もう一度入力"
        placeholderTextColor={MonoColors.textMuted}
        secureTextEntry
        autoCapitalize="none"
      />
      <EditorActions
        busy={busy}
        onCancel={onCancel}
        onSave={() => onSave(pw, pw2)}
      />
    </View>
  );
}

function EditorActions({
  busy,
  saveLabel = '保存',
  onCancel,
  onSave,
}: {
  busy: boolean;
  saveLabel?: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <View style={styles.editorActions}>
      <Pressable style={[styles.smallBtn, styles.smallBtnGhost]} onPress={onCancel} disabled={busy}>
        <Text style={styles.smallBtnGhostText}>キャンセル</Text>
      </Pressable>
      <Pressable
        style={[styles.smallBtn, styles.smallBtnSolid, busy && styles.btnDisabled]}
        onPress={() => {
          tapImpact();
          onSave();
        }}
        disabled={busy}>
        {busy ? (
          <ActivityIndicator size="small" color={MonoColors.onInk} />
        ) : (
          <Text style={styles.smallBtnSolidText}>{saveLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

function msg(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  // Supabase (PostgrestError / AuthError) は Error インスタンスではなくプレーンオブジェクト
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; error_description?: unknown; hint?: unknown };
    const m = o.message ?? o.error_description;
    if (typeof m === 'string' && m) {
      return typeof o.hint === 'string' && o.hint ? `${m}（${o.hint}）` : m;
    }
  }
  return fallback;
}

/* ============================================================
 * スタイル
 * ========================================================== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MonoColors.screenBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: MonoLayout.screenPadding, paddingBottom: 48 },

  /* ゲストバナー */
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: MonoLayout.radiusControl,
    backgroundColor: MonoColors.accentTint,
    borderWidth: 1,
    borderColor: MonoColors.border,
  },
  guestBannerText: { flex: 1, fontSize: 11, lineHeight: 16, color: MonoColors.textSecondary },
  guestBannerCta: { fontSize: 12, fontWeight: '700', color: MonoColors.accent },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: MonoLayout.screenPadding,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: 2, color: MonoColors.ink },

  /* プロフィールカード */
  profileCard: {
    backgroundColor: MonoColors.surface,
    borderRadius: MonoLayout.radiusCard,
    borderWidth: 1,
    borderColor: MonoColors.border,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 4,
    overflow: 'hidden',
  },
  decoGlyphCorner: { position: 'absolute', top: 10, right: 14, fontSize: 15, opacity: 0.7 },
  avatarRing: {
    padding: 4,
    borderRadius: MonoLayout.radiusPill,
    borderWidth: 1,
    borderColor: MonoColors.accent,
    marginBottom: 12,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: MonoLayout.radiusPill,
    backgroundColor: MonoColors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 38 },
  name: { fontSize: 20, fontWeight: '700', color: MonoColors.ink },
  publicPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: MonoColors.accentTint,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: MonoLayout.radiusPill,
    marginTop: 8,
  },
  publicPillText: { fontSize: 11, fontWeight: '600', color: MonoColors.accent },
  editLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: MonoLayout.radiusPill,
    borderWidth: 1,
    borderColor: MonoColors.border,
  },
  editLinkText: { fontSize: 13, fontWeight: '600', color: MonoColors.accent },

  /* セクション / カード */
  sectionLabel: {
    marginTop: 26,
    marginBottom: 10,
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: MonoColors.textSecondary,
  },
  card: {
    backgroundColor: MonoColors.surface,
    borderRadius: MonoLayout.radiusCard,
    borderWidth: 1,
    borderColor: MonoColors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowLabel: { fontSize: 13, color: MonoColors.textSecondary },
  rowLabelStrong: { flex: 1, fontSize: 15, fontWeight: '600', color: MonoColors.inkSoft },
  rowValue: { fontSize: 15, color: MonoColors.ink, marginTop: 2 },
  actionText: { fontSize: 13, fontWeight: '700', color: MonoColors.ink },
  divider: { height: 1, backgroundColor: MonoColors.border, marginLeft: 46 },

  warnBadge: {
    backgroundColor: MonoColors.dangerTint,
    borderRadius: MonoLayout.radiusPill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  warnBadgeText: { fontSize: 10, fontWeight: '700', color: MonoColors.danger },

  /* インライン編集 */
  editorBlock: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    gap: 10,
    backgroundColor: MonoColors.surfaceAlt,
  },
  editorLabel: { fontSize: 12, fontWeight: '600', color: MonoColors.textSecondary },
  editorInput: {
    backgroundColor: MonoColors.surface,
    borderWidth: 1,
    borderColor: MonoColors.border,
    borderRadius: MonoLayout.radiusControl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
    fontSize: 15,
    color: MonoColors.ink,
  },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: MonoLayout.radiusPill,
    backgroundColor: MonoColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  emojiOptionActive: { borderColor: MonoColors.ink },
  emojiOptionText: { fontSize: 20 },
  editorActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  smallBtn: {
    flex: 1,
    height: 42,
    borderRadius: MonoLayout.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnGhost: { borderWidth: 1, borderColor: MonoColors.border, backgroundColor: MonoColors.surface },
  smallBtnGhostText: { fontSize: 13, fontWeight: '600', color: MonoColors.inkSoft },
  smallBtnSolid: { backgroundColor: MonoColors.ink },
  smallBtnSolidText: { fontSize: 13, fontWeight: '700', color: MonoColors.onInk },
  btnDisabled: { opacity: 0.5 },

  footNote: {
    marginTop: 28,
    textAlign: 'center',
    fontSize: 12,
    letterSpacing: 1,
    color: MonoColors.textMuted,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26,26,26,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
