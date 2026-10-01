import React, { useCallback, useRef } from 'react';

/**
 * MagneticButton —— 磁吸 CTA + 光泽扫过。
 *
 * 为什么值得做：首屏 CTA 是转化路径上唯一的强交互点，但它此前的反馈只有
 * `hover:shadow-md`，与背景里那些 22 秒循环的光斑相比反而最"木"。
 * 磁吸让按钮对光标产生**微小的物理响应**（3–8px，不是跟到底），
 * 加上 hover 时一道光横扫，是最低成本换最高记忆点的手法。
 *
 * 约束：
 *   · 位移只在 3–8px 量级 —— 跟满会显得廉价且影响点击命中
 *   · `prefers-reduced-motion` 时完全关闭位移，只保留 hover 变色
 *   · 位移动画走 transform，不触发 layout
 */

export interface MagneticButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 最大位移像素（建议 4–8，超过 10 会显得廉价） */
  strength?: number;
  /** 是否展示 hover 光泽扫过 */
  sheen?: boolean;
  children: React.ReactNode;
}

export const MagneticButton: React.FC<MagneticButtonProps> = ({
  strength = 6,
  sheen = true,
  className = '',
  children,
  onMouseMove,
  onMouseLeave,
  ...rest
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const rafRef = useRef(0);

  const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onMouseMove?.(e);
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      // 归一化到 [-1, 1]，再乘以 strength
      const dx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const dy = ((e.clientY - rect.top) / rect.height - 0.5) * 2;

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        el.style.transform = `translate3d(${(dx * strength).toFixed(2)}px, ${(
          dy * strength * 0.6
        ).toFixed(2)}px, 0)`;
      });
    },
    [strength, onMouseMove],
  );

  const handleLeave = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      onMouseLeave?.(e);
      const el = ref.current;
      if (!el) return;
      cancelAnimationFrame(rafRef.current);
      el.style.transform = 'translate3d(0, 0, 0)';
    },
    [onMouseLeave],
  );

  return (
    <button
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`group relative overflow-hidden transition-transform duration-fast ease-spring ${className}`}
      {...rest}
    >
      {sheen && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-slower ease-smooth bg-gradient-to-r from-transparent via-white/35 to-transparent"
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
};

export default MagneticButton;
