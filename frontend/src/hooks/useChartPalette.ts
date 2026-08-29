import { useMemo } from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';

/** hex (#RRGGBB) → HSL 对象 */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hh = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hh = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hh = (b - r) / d + 2; break;
      default: hh = (r - g) / d + 4;
    }
    hh *= 60;
  }
  return { h: Math.round(hh), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** HSL → hex */
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s));
  l = Math.max(0, Math.min(100, l));
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** hex → rgba 字符串 */
function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface ChartPalette {
  /** 品牌主色 */
  primary: string;
  /** 主色浅变体（hover / 高亮） */
  primaryLight: string;
  /** 主色深变体 */
  primaryDark: string;
  /** 主色面积渐变（低透明度） */
  area: string;
  /** 主色渐变对（图表渐变填充用） */
  gradient: [string, string];
  /** 辅助色板（多系列图：饼图/堆叠） */
  series: string[];
  /** 中性辅助色（次轴/次要系列） */
  neutral: string;
}

/**
 * useChartPalette —— 让全部图表跟随品牌主色（brand_color）。
 *
 * 基于当前工作空间的品牌色生成同系色板：
 * 主色 / 浅变体 / 深变体 / 面积渐变 / 渐变对 / 多系列色板。
 * 品牌色变化时自动重算（useMemo 依赖 brand_color）。
 */
export function useChartPalette(): ChartPalette {
  const { currentWorkspace } = useWorkspace();
  const brand = currentWorkspace?.brand_color || '#7C3AED';

  return useMemo<ChartPalette>(() => {
    const c = hexToHsl(brand);
    const primary = brand;
    const primaryLight = hslToHex(c.h, Math.min(c.s + 6, 100), Math.min(c.l + 20, 94));
    const primaryDark = hslToHex(c.h, Math.min(c.s + 10, 100), Math.max(c.l - 14, 10));
    // 多系列色板：主色 + 同色系偏移 + 邻近色（保证美观且统一）
    const series = [
      brand,
      hslToHex(c.h + 30, c.s, c.l),
      hslToHex(c.h - 30, c.s, c.l),
      hslToHex(c.h + 60, Math.min(c.s - 10, 100), Math.max(c.l + 8, 20)),
      hslToHex(c.h - 60, Math.min(c.s - 10, 100), Math.max(c.l + 8, 20)),
    ];
    return {
      primary,
      primaryLight,
      primaryDark,
      area: hexToRgba(brand, 0.12),
      gradient: [brand, hslToHex(c.h + 40, c.s, c.l)],
      series,
      neutral: '#94a3b8',
    };
  }, [brand]);
}
