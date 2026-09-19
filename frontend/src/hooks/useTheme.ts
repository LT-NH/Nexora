/**
 * 主题 hook —— **已迁移到全局 Context**，此文件仅作转发，保持既有 import 路径可用。
 *
 * 历史问题（2026-09-19 修复）：本文件原先是一个内部持有 `useState` 的普通 hook，
 * 每个调用方各拿一份独立状态 → 顶栏、命令面板、各 ECharts 实例互不同步，
 * 表现为「主题要一个页面一个页面单独切换」：
 *   - 顶栏切深色后，图表实例里的 resolvedTheme 仍是旧值 → 图表不变色；
 *   - 从命令面板切换时，它基于自己那份陈旧状态算下一个值，顶栏图标不更新。
 *
 * 现在唯一事实来源是 `@/contexts/ThemeContext`（已在 main.tsx 根部挂载）。
 * 本文件保留为转发层，因此所有既有 import 路径无需改动。
 */

export { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
export type { Theme, ThemeContextValue } from '@/contexts/ThemeContext';
