export type Theme = 'dark' | 'light' | 'oled';
export const readThemePreference = (): Theme | null => {
  try { const value = localStorage.getItem('nullchannel_theme'); return value === 'dark' || value === 'light' || value === 'oled' ? value : null; }
  catch { return null; }
};
export const systemTheme = (): Theme => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
