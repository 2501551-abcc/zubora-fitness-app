/**
 * ログイン / 新規登録画面（"/auth"）
 * -------------------------------------------------------------
 * モノトーン基調 ＋ 星・リボンのワンポイントで「大人カワイイ」。
 * ・「ログイン」「アカウント作成」をタブで切り替え
 * ・アカウント作成時はニックネーム（username）も入力
 * ・Supabase Auth（メール / パスワード）
 *
 * アイコンは同梱の @expo/vector-icons（Feather）を使用。
 * lucide-react-native に差し替える場合は下記 import を
 *   import { Star, Mail, Lock, User, Eye, EyeOff } from 'lucide-react-native';
 * に変え、<Feather name="x" /> を <Star /> 等へ置換してください。
 */

import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MonoColors, MonoGlyph, MonoLayout } from '@/constants/mono-theme';
import { tapImpact, tapLight } from '@/lib/haptics';
import { signIn, signUp } from '@/services/authService';

type Mode = 'login' | 'signup';
type Notice = { tone: 'info' | 'error'; text: string };

/** GoTrue の英語エラーを日本語＋次にやることに置き換える。 */
function toJaAuthMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('email not confirmed'))
    return 'メールアドレスが未確認です。届いた確認メールのリンクを開くか、Supabase の Authentication 設定で「Confirm email」をオフにしてください。';
  if (m.includes('invalid login credentials'))
    return 'メールアドレスかパスワードが違います。';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already'))
    return 'このメールアドレスは登録済みです。上のタブを「ログイン」にしてお試しください。';
  if (m.includes('password should be at least') || m.includes('password is too short'))
    return 'パスワードが短すぎます。6文字以上にしてください。';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('for security purposes'))
    return '試行が多すぎます。少し時間をおいてからお試しください。';
  if (m.includes('timeout') || m.includes('タイムアウト') || m.includes('network') || m.includes('failed to fetch'))
    return '通信に失敗しました。電波・Wi-Fi を確認してもう一度お試しください。';
  if (m.includes('unable to validate email') || m.includes('invalid format'))
    return 'メールアドレスの形式が正しくありません。';
  return raw;
}

export default function AuthScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const isSignup = mode === 'signup';

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    tapLight();
    setMode(next);
    setNotice(null);
  };

  const validationError = (): string | null => {
    if (isSignup && username.trim().length < 2) return 'ニックネームは2文字以上で入力してください。';
    if (!email.trim()) return 'メールアドレスを入力してください。';
    if (password.length < 6) return 'パスワードは6文字以上で入力してください。';
    return null;
  };

  const handleSubmit = async () => {
    console.log('[auth] submit', { mode, hasEmail: !!email.trim(), pwLen: password.length });
    tapImpact();
    if (loading) return;

    const invalid = validationError();
    if (invalid) {
      setNotice({ tone: 'error', text: invalid });
      return;
    }

    setNotice(null);
    setLoading(true);
    try {
      if (isSignup) {
        const { needsEmailConfirm } = await signUp({
          email,
          password,
          name: username.trim(),
        });
        if (needsEmailConfirm) {
          setMode('login');
          setNotice({
            tone: 'info',
            text: `${email.trim()} に確認メールを送りました。メールのリンクを開いてから「ログイン」してください。届かない場合は Supabase の設定で「Confirm email」をオフにできます。`,
          });
        } else {
          router.replace('/(tabs)');
        }
      } else {
        await signIn(email, password);
        router.replace('/(tabs)');
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setNotice({ tone: 'error', text: toJaAuthMessage(raw) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}>
          {/* ブランドマーク */}
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Feather name="star" size={22} color={MonoColors.ink} />
            </View>
            <Text style={styles.brandName}>zubora</Text>
            <Text style={styles.brandTagline}>
              {MonoGlyph.ribbon} がんばらない筋トレ習慣
            </Text>
          </View>

          {/* タブ切り替え */}
          <View style={styles.tabs}>
            <TabButton
              label="ログイン"
              active={mode === 'login'}
              onPress={() => switchMode('login')}
            />
            <TabButton
              label="アカウント作成"
              active={mode === 'signup'}
              onPress={() => switchMode('signup')}
            />
          </View>

          {/* フォーム */}
          <View style={styles.form}>
            {isSignup && (
              <Field
                icon="user"
                label="ニックネーム"
                placeholder="例）ゆるトレ子"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                maxLength={20}
              />
            )}

            <Field
              icon="mail"
              label="メールアドレス"
              placeholder="example@email.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />

            <Field
              // secureTextEntry を切り替えると iOS で文字が重なるため、切替時は作り直す
              key={showPassword ? 'pw-visible' : 'pw-hidden'}
              icon="lock"
              label="パスワード"
              placeholder="6文字以上"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              trailing={
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    tapLight();
                    setShowPassword((v) => !v);
                  }}>
                  <Feather
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={18}
                    color={MonoColors.textMuted}
                  />
                </Pressable>
              }
            />

            {notice && (
              <View
                style={[
                  styles.notice,
                  notice.tone === 'error' ? styles.noticeError : styles.noticeInfo,
                ]}>
                <Feather
                  name={notice.tone === 'error' ? 'alert-circle' : 'mail'}
                  size={15}
                  color={notice.tone === 'error' ? MonoColors.danger : MonoColors.accent}
                />
                <Text style={styles.noticeText}>{notice.text}</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                loading && styles.primaryButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color={MonoColors.onInk} />
              ) : (
                <>
                  <Feather name="star" size={15} color={MonoColors.onInk} />
                  <Text style={styles.primaryButtonText}>
                    {isSignup ? 'アカウントを作成' : 'ログイン'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {/* フッターの切り替え導線 */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {isSignup
                ? 'すでにアカウントをお持ちですか？'
                : 'アカウントをお持ちでないですか？'}
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => switchMode(isSignup ? 'login' : 'signup')}>
              <Text style={styles.footerLink}>
                {isSignup ? 'ログイン' : '新規登録'} {MonoGlyph.sparkle}
              </Text>
            </Pressable>
          </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- パーツ ---------- */

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}>
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>
        {label}
      </Text>
      {active && <View style={styles.tabUnderline} />}
    </Pressable>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  trailing?: React.ReactNode;
};

function Field({ icon, label, trailing, ...inputProps }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.inputRowFocused]}>
        <Feather name={icon} size={18} color={MonoColors.textMuted} />
        <TextInput
          style={styles.input}
          placeholderTextColor={MonoColors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...inputProps}
        />
        {trailing}
      </View>
    </View>
  );
}

/* ---------- スタイル ---------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MonoColors.screenBg,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: MonoLayout.screenPadding,
    paddingTop: 56,
    paddingBottom: 48,
  },

  brand: {
    alignItems: 'center',
    marginBottom: 36,
  },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: MonoLayout.radiusPill,
    borderWidth: 1,
    borderColor: MonoColors.border,
    backgroundColor: MonoColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brandName: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 4,
    color: MonoColors.ink,
  },
  brandTagline: {
    marginTop: 6,
    fontSize: 12,
    letterSpacing: 1,
    color: MonoColors.textSecondary,
  },

  tabs: {
    flexDirection: 'row',
    backgroundColor: MonoColors.surfaceAlt,
    borderRadius: MonoLayout.radiusControl,
    padding: 4,
    marginBottom: 28,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: MonoLayout.radiusControl - 4,
  },
  tabButtonActive: {
    backgroundColor: MonoColors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: MonoColors.textMuted,
  },
  tabButtonTextActive: {
    color: MonoColors.ink,
  },
  tabUnderline: {
    marginTop: 6,
    width: 16,
    height: 2,
    borderRadius: 2,
    backgroundColor: MonoColors.accent,
  },

  form: { gap: MonoLayout.gap },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: MonoLayout.radiusControl,
    borderWidth: 1,
  },
  noticeInfo: { backgroundColor: MonoColors.accentTint, borderColor: MonoColors.border },
  noticeError: { backgroundColor: MonoColors.dangerTint, borderColor: MonoColors.border },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, color: MonoColors.inkSoft },

  field: { gap: 8 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: MonoColors.inkSoft,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: MonoColors.surface,
    borderWidth: 1,
    borderColor: MonoColors.border,
    borderRadius: MonoLayout.radiusControl,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputRowFocused: {
    borderColor: MonoColors.borderStrong,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: MonoColors.ink,
    paddingVertical: 12,
  },

  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: MonoColors.ink,
    borderRadius: MonoLayout.radiusControl,
    height: 54,
    marginTop: 8,
  },
  primaryButtonPressed: { opacity: 0.85 },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    color: MonoColors.onInk,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },

  footer: {
    marginTop: 28,
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 13,
    color: MonoColors.textSecondary,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '700',
    color: MonoColors.ink,
  },
});
