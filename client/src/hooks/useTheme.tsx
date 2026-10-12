import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { readThemePreference, systemTheme, type Theme } from '../lib/theme';

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreference] = useState<Theme | null>(readThemePreference);
  const [system, setSystem] = useState<Theme>(systemTheme);
  const theme = preference ?? system;

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-color-scheme: light)');
    const changed = () => setSystem(query.matches ? 'light' : 'dark');
    query.addEventListener?.('change', changed);
    return () => query.removeEventListener?.('change', changed);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const value = useMemo(
    () => ({ theme, toggleTheme: () => {
      const next = theme === 'dark' ? 'light' : 'dark';
      setPreference(next);
      try { localStorage.setItem('nullchannel_theme', next); } catch { /* Keep the in-memory preference. */ }
    } }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
