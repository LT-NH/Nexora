import { useEffect } from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * 品牌白标定制：把当前工作空间的品牌色应用到全局 CSS 变量。
 *
 * ⚠️ 深色模式**不再由本 hook 直接改 DOM**（2026-09-19 修复）。
 *
 * 历史问题：本 hook 原先自己往 `<html>` 加/删 `dark` class，于是与
 * `useTheme`、Landing 的固定浅色逻辑形成**三个互抢的写入方**，谁最后跑谁赢。
 * 具体冲突：theme=system 时它按品牌设置覆盖，把「跟随系统」的深色抹掉；
 * brand_dark_mode=true 时它加 dark，而顶栏切换器仍显示「浅色模式」。
 *
 * 现在只通过 `setBrandDark()` 把品牌偏好**告知主题层**，由 ThemeProvider
 * 作为唯一写入方按统一优先级裁决：
 *   用户显式选择 > 品牌默认（仅当用户从未选择）> 系统偏好
 */
export const useBranding = () => {
  const { currentWorkspace } = useWorkspace();
  const { setBrandDark } = useTheme();

  // 品牌色：写入 CSS 变量（与主题无关，保持原样）
  useEffect(() => {
    const color = currentWorkspace?.brand_color || '#7C3AED';
    document.documentElement.style.setProperty('--brand-color', color);
  }, [currentWorkspace]);

  // 品牌默认深色：交给主题层裁决，本 hook 不碰 classList
  useEffect(() => {
    setBrandDark(currentWorkspace?.brand_dark_mode ?? false);
  }, [currentWorkspace, setBrandDark]);
};
