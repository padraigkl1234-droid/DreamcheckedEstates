'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { translate, type LangCode } from '@/lib/i18n';

const STORAGE_KEY = 'invictus-lang';

interface LanguageContextType {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>('en');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as LangCode | null;
    if (stored) setLangState(stored);
  }, []);

  const setLang = useCallback((l: LangCode) => {
    window.localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  }, []);

  const t = useCallback((key: string) => translate(lang, key), [lang]);

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (ctx === undefined) throw new Error('useLang must be used within a LanguageProvider');
  return ctx;
}

// Convenience: just the translate function.
export function useT() {
  return useLang().t;
}
