import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { routeProgress } from '@/lib/viewTransition';

/**
 * 顶部 2px 渐变进度条：页面转场 / 懒加载 chunk 期间显示。
 * 在 App 根部渲染一次；路由变化时自动收尾。
 */
export const RouteProgress: React.FC = () => {
  const [visible, setVisible] = useState(routeProgress.isVisible());
  const [busy, setBusy] = useState(false);
  const location = useLocation();

  useEffect(() => routeProgress.subscribe(setVisible), []);

  // 路由变化 → 本次加载结束
  useEffect(() => {
    routeProgress.done();
    setBusy(true);
    const t = setTimeout(() => setBusy(false), 400);
    return () => clearTimeout(t);
  }, [location.pathname]);

  const show = visible || busy;
  return (
    <div
      aria-hidden
      className={`fixed top-0 left-0 right-0 z-[10000] pointer-events-none transition-opacity duration-300 ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="h-0.5 w-full overflow-hidden">
        <div className="route-progress-bar h-full w-full origin-left" />
      </div>
    </div>
  );
};
