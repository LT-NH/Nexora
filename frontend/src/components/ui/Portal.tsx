import React from 'react';
import { createPortal } from 'react-dom';

/**
 * 把浮层挂到 document.body，与祖先的排版/样式彻底解耦。
 *
 * 为什么需要它（2026-09-17 实测踩坑，两个独立原因叠在一起）：
 *
 * 1）**祖先带 transform 会让 `position: fixed` 失效**
 *    CSS 规范：祖先只要有非 none 的 transform（含 Tailwind 的裸 `transform`
 *    工具类，它计算值是 matrix(1,0,0,1,0,0) 而非 none），其 fixed 后代会改为
 *    **相对该祖先**定位。实测「添加店铺」遮罩落在 x=240 / w=1040（应为 0 / 1280）。
 *
 * 2）**父级的 `space-y-*` 会给子元素强加 margin-top**
 *    Tailwind 的 `space-y-6` 展开为
 *    `.space-y-6 > :not([hidden]) ~ :not([hidden]) { margin-top: 1.5rem }`。
 *    一个本该铺满全屏的 `fixed inset-0` 浮层，因为同时设了 top 和 bottom 且
 *    height:auto，被这 24px 的 margin-top 挤成 y=24 / h=696（应为 0 / 720）。
 *
 * 这两条都是「内容的排版规则误伤浮层」。挂在 body 下就同时免疫。
 *
 * 对暗色模式无影响：本项目 darkMode 是 'class' 且挂在 <html> 上，body 在 html 内。
 * React 事件仍沿组件树冒泡（portal 不改变 React 树结构）。
 */
export const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // SPA 环境 document 恒存在；仅在 SSR 兜底时就地渲染
  if (typeof document === 'undefined') return <>{children}</>;
  return createPortal(children, document.body);
};

export default Portal;
