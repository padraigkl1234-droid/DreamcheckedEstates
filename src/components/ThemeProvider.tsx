'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemePref = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'invictus-theme';

interface ThemeContextType {
  theme: ThemePref; // the user's preference
  resolved: 'dark' | 'light'; // what's actually applied
  setTheme: (t: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(pref: ThemePref): 'dark' | 'light' {
  const resolved = pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref;
  const el = document.documentElement;
  el.classList.toggle('dark', resolved === 'dark');
  el.setAttribute('data-theme', resolved);
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>('dark');
  const [resolved, setResolved] = useState<'dark' | 'light'>('dark');

  // Load the saved preference on mount (the inline script in <head> has already
  // applied it to avoid a flash; this just syncs React state).
  useEffect(() => {
    const stored = (window.localStorage.getItem(STORAGE_KEY) as ThemePref | null) ?? 'dark';
    setThemeState(stored);
    setResolved(apply(stored));
  }, []);

  // React to OS theme changes while on "system".
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(apply('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((t: ThemePref) => {
    window.localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
    setResolved(apply(t));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
