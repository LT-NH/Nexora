import { useEffect, useRef, useState } from 'react';

export const useReveal = (threshold = 0.15, delay = 0) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

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
  }, [threshold]);

  const style: React.CSSProperties = {
    transition: `opacity 0.8s ${delay}ms cubic-bezier(0.25,0.1,0.25,1), transform 0.8s ${delay}ms cubic-bezier(0.25,0.1,0.25,1)`,
  };

  return { ref, visible, style };
};
