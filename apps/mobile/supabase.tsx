
/**
 * Supabase クライアント（React Native / Expo 用）
 * -------------------------------------------------------------
 * ・セッションは AsyncStorage に永続化（アプリ再起動後もログイン維持）
 * ・detectSessionInUrl は RN では false
 * ・フォアグラウンド中だけトークンを自動更新（AppState 連携）
 *
 * URL / anon key は app.json の extra か .env（EXPO_PUBLIC_）へ移すのを推奨。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://lihwukvbugvtbevbbbeg.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpaHd1a3ZidWd2dGJldmJiYmVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2NzAwNzksImV4cCI6MjA5OTI0NjA3OX0.2DzIHb2Hs6iCqDdq80CBVko5QSx6ArQg_BxXayAb9xU';

// Node.js環境（SSR時）に window に触れない安全なストレージ切り替え
const isServer = typeof window === 'undefined';

const NoopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isServer ? NoopStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});