import { Sun, Moon } from 'lucide-react';
import { Button } from './Button';
import { useTheme } from '../../hooks/useTheme';

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button className="theme-toggle" variant="ghost" onClick={toggleTheme} aria-label="Toggle theme" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      <span className="sr-only">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
    </Button>
  );
};
