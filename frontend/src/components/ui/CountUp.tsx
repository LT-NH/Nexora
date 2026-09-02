import React, { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/** 千分位格式化 */
function formatNumber(n: number, decimals: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * CountUp —— 数字滚动动画（requestAnimationFrame，60fps）。
 * 挂载后从 0 滚动到 value；**value 变化时从旧值平滑滚到新值**（diff 动画），
 * 配合 StatCard / 自动同步刷新使用，数据更新时数字"活"起来。
 */
export const CountUp: React.FC<CountUpProps> = ({
  value,
  duration = 1000,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}) => {
  // display 用 ref 驱动 rAF，避免每帧 setState 之外的闭包旧值
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      // easeOutCubic：先快后慢，质感更好
      const eased = 1 - Math.pow(1 - p, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      fromRef.current = current;
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span className={className} suppressHydrationWarning>
      {prefix}
      {formatNumber(display, decimals)}
      {suffix}
    </span>
  );
};
