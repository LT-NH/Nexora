import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import FloatingActionButton from '@/components/ui/FloatingActionButton';

export const BackToTop: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 500);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <FloatingActionButton
      slot="backToTop"
      variant="neutral"
      label="返回顶部"
      icon={<ArrowUp size={20} />}
      onClick={scrollToTop}
      visible={visible}
    />
  );
};
