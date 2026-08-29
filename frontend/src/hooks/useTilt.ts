import { useEffect, useRef } from 'react';

/**
 * useTilt —— 鼠标跟随 3D 倾斜（perspective + rotateX/Y）。
 * 仅桌面（≥1024px）且未开启 prefers-reduced-motion 时生效。
 * 返回 ref，挂到需要倾斜的元素上；元素自身的 transform 会被接管。
 */
export const useTilt = <T extends HTMLElement>(maxDeg = 6) => {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.innerWidth < 1024) return;

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(1200px) rotateY(${(px * maxDeg).toFixed(2)}deg) rotateX(${(-py * maxDeg).toFixed(2)}deg)`;
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.transform = 'perspective(1200px) rotateY(0deg) rotateX(0deg)';
      window.setTimeout(() => {
        el.style.transition = '';
      }, 620);
    };

    el.addEventListener('mousemove', onMove, { passive: true });
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [maxDeg]);

  return ref;
};
