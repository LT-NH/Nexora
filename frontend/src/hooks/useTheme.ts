import { useState, useEffect, useLayoutEffect, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'nexora-theme';

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      return stored;
    }
  } catch {}
  return 'light'; // 默认浅色调
}

function getResolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function applyThemeClass(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  // useLayoutEffect 而非 useEffect：View Transitions 的 startViewTransition 会在
  // flushSync(toggleTheme) 返回后立即捕获"新快照"；passive effect 异步执行会让
  // dark class 来不及应用 → 涟漪揭示的是旧主题快照，真正变色变成动画后的跳变。
  // layout effect 在 commit 阶段同步执行，快照正确。
  useLayoutEffect(() => {
    const resolved = getResolvedTheme(theme);
    applyThemeClass(resolved);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        applyThemeClass(e.matches ? 'dark' : 'light');
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  const resolvedTheme = getResolvedTheme(theme);

  return { theme, resolvedTheme, setTheme, toggleTheme };
}
