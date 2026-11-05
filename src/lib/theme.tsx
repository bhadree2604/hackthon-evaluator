import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import {
  DarkColors,
  LightColors,
  neutralGradient,
  roleThemes,
  type Colors,
  type RoleKey,
  type RoleThemeEntry,
} from '@/constants/brand';
import * as SecureStore from '@/lib/secure-store';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

const STORAGE_KEY = 'hackthon-evaluator.themeMode';

type ThemeValue = {
  mode: ThemeMode;
  scheme: Scheme;
  colors: Colors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      })
      .catch(() => {
        // No stored preference: follow the system.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {
      // Preference is still applied for this launch.
    });
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme: Scheme = mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;
    const isDark = scheme === 'dark';
    return {
      mode,
      scheme,
      isDark,
      colors: isDark ? DarkColors : LightColors,
      setMode,
    };
  }, [mode, setMode, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * The boot splash and the router error boundary can render outside the
 * provider, so this falls back to the dark palette rather than throwing.
 */
const FALLBACK: ThemeValue = {
  mode: 'dark',
  scheme: 'dark',
  isDark: true,
  colors: DarkColors,
  setMode: () => {},
};

function useTheme() {
  return useContext(ThemeContext) ?? FALLBACK;
}

/** The active palette. Components name it `Brand` so token usage reads the same. */
export function useColors(): Colors {
  return useTheme().colors;
}

export function useThemeMode() {
  const { mode, scheme, isDark, setMode } = useTheme();
  return { mode, scheme, isDark, setMode };
}

export function useRoleTheme(): Record<RoleKey, RoleThemeEntry> {
  const { colors, isDark } = useTheme();
  return useMemo(() => roleThemes(colors, isDark), [colors, isDark]);
}

export function useNeutralGradient(): [string, string, string] {
  const { colors, isDark } = useTheme();
  return useMemo(() => neutralGradient(colors, isDark), [colors, isDark]);
}

/**
 * Themed replacement for `StyleSheet.create`.
 *
 * Styles are built once per palette and cached by palette identity, so
 * switching theme rebuilds them and staying put costs nothing.
 *
 *   const useStyles = makeStyles((Brand) => ({ card: { color: Brand.text } }));
 *   ...
 *   const styles = useStyles();
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(build: (colors: Colors) => T) {
  const cache = new Map<Colors, T>();

  return function useStyles(): T {
    const colors = useColors();
    let sheet = cache.get(colors);
    if (!sheet) {
      sheet = StyleSheet.create(build(colors));
      cache.set(colors, sheet);
    }
    return sheet;
  };
}
