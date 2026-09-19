import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

/**
 * 主题的**唯一事实来源与唯一 class 写入方**。
 *
 * ## 修复的问题（2026-09-19）
 *
 * 用户反馈「深浅色切换要一个页面一个页面单独切」。排查发现**三个互抢的写入方**，
 * 都在直接改 `<html>` 的 `dark` class，谁最后跑谁赢，结果每页表现不一致：
 *
 *  1. `useTheme` 原先只是内部持有 `useState` 的普通 hook —— 顶栏、命令面板、
 *     每个 ECharts 实例**各持一份状态**，互不同步（图表切换后不变色、
 *     两个入口显示互相矛盾）。
 *  2. `useBranding` 又写一次 class，且规则与 useTheme **冲突**：
 *     theme=system 时它按品牌设置覆盖，把「跟随系统」的深色直接抹掉；
 *     brand_dark_mode=true 时它加 dark，而顶栏仍显示"浅色模式"。
 *  3. `Landing` 用 MutationObserver 硬扛，把 dark class 强行按住（营销页固定浅色），
 *     并在卸载时用**挂载时捕获的旧值**恢复。
 *
 * ## 现在的模型（单一事实来源）
 *
 *   用户显式选择 (light/dark) > 品牌默认（仅在用户从未选择时）> 系统偏好（system）
 *   而 `forceLight`（Landing 等固定浅色页）**只在渲染层生效**，不篡改用户选择。
 *
 * 所有 class 变更都只经过本文件的 `applyThemeClass`，其他模块通过
 * `setBrandDark()` / `setForceLight()` 表达意图，不再自己动 DOM。
 */

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'nexora-theme';

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      return stored;
    }
  } catch {
    /* localStorage 不可用（隐私模式等）→ 视作未选择 */
  }
  return null;
}

function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* 忽略：主题在当前会话内仍然生效 */
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeClass(resolved: 'light' | 'dark'): void {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  // data-theme 供测试与调试断言（额外的属性不影响样式）
  root.dataset.theme = resolved;
}

export interface ThemeContextValue {
  /** 有效主题（用户选择；未选择时为品牌默认）。供切换器显示当前档位。 */
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  /** 用户是否显式选择过主题 */
  hasUserChoice: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** 工作空间的品牌默认深色（仅在用户未选择时生效） */
  setBrandDark: (dark: boolean) => void;
  /** 固定浅色页（如 Landing）使用；只影响渲染，不篡改用户选择 */
  setForceLight: (force: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userTheme, setUserTheme] = useState<Theme | null>(readStoredTheme);
  const [brandDark, setBrandDarkState] = useState(false);
  const [forceLight, setForceLightState] = useState(false);
  const [osDark, setOsDark] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : systemPrefersDark(),
  );

  // 系统偏好变化（仅当有效主题是 system 时才会影响最终结果）
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // 跨标签页同步
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue;
      if (next === 'light' || next === 'dark' || next === 'system') {
        setUserTheme(next);
      } else if (next === null) {
        setUserTheme(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // 有效主题：用户选择优先；未选择时用品牌默认
  const effectiveTheme: Theme = userTheme ?? (brandDark ? 'dark' : 'light');

  const resolvedTheme: 'light' | 'dark' = useMemo(() => {
    if (forceLight) return 'light';
    if (effectiveTheme === 'system') return osDark ? 'dark' : 'light';
    return effectiveTheme;
  }, [forceLight, effectiveTheme, osDark]);

  // useLayoutEffect 而非 useEffect：View Transitions 的 startViewTransition 会在
  // flushSync(toggleTheme) 返回后立即捕获"新快照"；passive effect 异步执行会让
  // dark class 来不及应用 → 涟漪揭示的是旧主题快照，真正变色变成动画后的跳变。
  // layout effect 在 commit 阶段同步执行，快照正确。
  useLayoutEffect(() => {
    applyThemeClass(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setUserTheme(next);
    writeStoredTheme(next);
  }, []);

  // 三态循环：light → dark → system → light（从当前**有效**主题起算，
  // 这样用户未选择、品牌默认深色时，第一次点击会切到"跟随系统"而不是原地不动）
  const toggleTheme = useCallback(() => {
    setUserTheme((prev) => {
      const base: Theme = prev ?? (brandDark ? 'dark' : 'light');
      const next: Theme =
        base === 'light' ? 'dark' : base === 'dark' ? 'system' : 'light';
      writeStoredTheme(next);
      return next;
    });
  }, [brandDark]);

  const setBrandDark = useCallback((dark: boolean) => {
    setBrandDarkState(dark);
  }, []);

  const setForceLight = useCallback((force: boolean) => {
    setForceLightState(force);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: effectiveTheme,
      resolvedTheme,
      hasUserChoice: userTheme !== null,
      setTheme,
      toggleTheme,
      setBrandDark,
      setForceLight,
    }),
    [effectiveTheme, resolvedTheme, userTheme, setTheme, toggleTheme, setBrandDark, setForceLight],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/**
 * 读取全局主题状态。必须在 `<ThemeProvider>` 内使用（已在 main.tsx 根部挂载）。
 *
 * 与旧实现的区别：返回**共享状态**，任何一处调用 `toggleTheme` / `setTheme`
 * 都会让所有消费者同步更新（包括每个 ECharts 实例的 resolvedTheme）。
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error(
      'useTheme 必须在 <ThemeProvider> 内使用（ThemeProvider 已在 main.tsx 根部挂载）',
    );
  }
  return ctx;
}
