export type Theme = 'dark' | 'light';
export const readThemePreference = (): Theme | null => {
  try { const value = localStorage.getItem('nullchannel_theme'); return value === 'dark' || value === 'light' ? value : null; }
  catch { return null; }
};
export const systemTheme = (): Theme => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
