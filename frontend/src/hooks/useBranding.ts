import { useEffect } from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';

/**
 * 品牌白标定制：将当前工作空间的品牌色应用到全局 CSS 变量。
 *
 * 深色模式规则（避免与 useTheme 冲突）：
 * - 用户通过主题切换器明确选择了 light/dark → 尊重用户选择
 * - 用户处于 system 或从未选择 → 由品牌 brand_dark_mode 决定（默认浅色）
 */
export const useBranding = () => {
  const { currentWorkspace } = useWorkspace();

  useEffect(() => {
    const color = currentWorkspace?.brand_color || '#7C3AED';
    const brandDark = currentWorkspace?.brand_dark_mode ?? false;
    const root = document.documentElement;
    root.style.setProperty('--brand-color', color);

    let userTheme: string | null = null;
    try {
      userTheme = localStorage.getItem('nexora-theme');
    } catch {
      /* ignore */
    }

    if (userTheme === 'light') {
      root.classList.remove('dark');
    } else if (userTheme === 'dark') {
      root.classList.add('dark');
    } else {
      // system / 未选择 → 品牌设置决定（默认浅色）
      if (brandDark) root.classList.add('dark');
      else root.classList.remove('dark');
    }
  }, [currentWorkspace]);
};
