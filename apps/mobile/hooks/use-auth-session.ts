/**
 * 現在の Supabase セッションを購読するフック。
 * -------------------------------------------------------------
 * ・初回に getSession() で復元（セッションは AsyncStorage に永続化）
 * ・onAuthStateChange でログイン / ログアウトに追従
 *
 * ログイン必須の画面では `session` が null のときに
 * ログイン導線へ振り分ける（例: app/friends.tsx）。
 */

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '@/supabase';

export type AuthSessionState = {
  session: Session | null;
  /** 初回のセッション確認が終わるまで true */
  loading: boolean;
};

export function useAuthSession(): AuthSessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
