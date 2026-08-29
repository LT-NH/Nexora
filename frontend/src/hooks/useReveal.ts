import { useEffect, useRef, useState } from 'react';

/** 是否跳过滚动显现动画（reduced-motion 或环境不支持 IntersectionObserver） */
export const shouldSkipReveal = (): boolean => {
  if (typeof window === 'undefined') return true;
  if (!('IntersectionObserver' in window)) return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const useReveal = (threshold = 0.15, delay = 0) => {
  const ref = useRef<HTMLDivElement>(null);
  // reduced-motion / 无 IO 时直接可见，保证内容永不缺失
  const [visible, setVisible] = useState(shouldSkipReveal);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );

    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold]);

  const style: React.CSSProperties = shouldSkipReveal()
    ? {}
    : {
        transition: `opacity 0.8s ${delay}ms cubic-bezier(0.25,0.1,0.25,1), transform 0.8s ${delay}ms cubic-bezier(0.25,0.1,0.25,1)`,
      };

  return { ref, visible, style };
};
