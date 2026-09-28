'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translate, type Key, type Lang, type Vars } from './i18n';
import type { Bilingual } from '@masar/shared';

type Theme = 'light' | 'dark';

interface Prefs {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  toggleTheme: () => void;
  t: (k: Key | string, v?: Vars) => string;
  /** Picks the value in the current language, falling back to English. */
  tx: (b: Bilingual | null | undefined) => string;
}

const Ctx = createContext<Prefs | null>(null);
const YEAR = 60 * 60 * 24 * 365;

export function PrefsProvider({ initialLang, initialTheme, children }: { initialLang: Lang; initialTheme?: Theme; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  // Starts from the cookie (known on the server); a system preference is picked up after hydration.
  const [theme, setTheme] = useState<Theme>(initialTheme ?? 'light');
  useEffect(() => {
    if (document.documentElement.dataset.theme === 'dark') setTheme('dark');
  }, []);

  const setLang = useCallback((l: Lang) => {
    document.cookie = `masar_lang=${l}; path=/; max-age=${YEAR}; samesite=lax`;
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    document.title = l === 'ar' ? 'مسار' : 'Masar';
    setLangState(l);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((cur) => {
      const next = cur === 'dark' ? 'light' : 'dark';
      document.cookie = `masar_theme=${next}; path=/; max-age=${YEAR}; samesite=lax`;
      document.documentElement.dataset.theme = next;
      return next;
    });
  }, []);

  const value = useMemo<Prefs>(
    () => ({
      lang,
      setLang,
      theme,
      toggleTheme,
      t: (k, v) => translate(lang, k, v),
      tx: (b) => (b ? (lang === 'ar' ? b.ar || b.en : b.en || b.ar) : ''),
    }),
    [lang, setLang, theme, toggleTheme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrefs outside PrefsProvider');
  return v;
}
