/**
 * 迷你趋势线：把一段数值压成 SVG 折线，随品牌色。
 * 原为 Dashboard.tsx 的内联组件。
 */

import React from 'react';

/** 迷你趋势线：30 天数据压缩为 SVG 折线，随品牌色 */
export const MiniSparkline: React.FC<{ data: number[]; color: string; height?: number }> = ({ data, color, height = 22 }) => {
  if (!data || data.length < 2) return <div style={{ height }} />;
  const w = 100, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 3) - 1.5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full mt-1.5" preserveAspectRatio="none" style={{ height }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
};

