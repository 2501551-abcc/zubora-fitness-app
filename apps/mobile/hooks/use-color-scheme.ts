import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * RN 0.86 以降の useColorScheme() は 'light' | 'dark' | 'unspecified' を返す。
 * アプリ側はライト/ダークの二択で扱うため 'unspecified' は 'light' に寄せる。
 */
export function useColorScheme(): 'light' | 'dark' {
  return useRNColorScheme() === 'dark' ? 'dark' : 'light';
}
