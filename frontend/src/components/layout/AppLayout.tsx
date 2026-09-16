import React, { useState, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import FeedbackWidget from '@/components/FeedbackWidget';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { AIAssistant } from '@/components/AIAssistant';
import { useBranding } from '@/hooks/useBranding';
import { useI18n, translations } from '@/i18n';

const pageTitleKeys: Record<string, keyof typeof translations.zh> = {
  '/dashboard': 'dashboard',
  '/products': 'products',
  '/orders': 'orders',
  '/customers': 'customers',
  '/analytics': 'analytics',
  '/stores': 'stores',
  '/billing': 'billing',
  '/team': 'team',
  '/api-keys': 'api_keys',
  '/settings': 'settings',
  '/profile': 'profile',
  '/permissions': 'permissions',
  '/coupons': 'coupons',
  '/refunds': 'refunds',
  '/webhooks': 'webhooks',
  '/ai-chat': 'ai_chat',
  '/payments': 'payments',
};

/** Maps the current pathname to breadcrumb items. */
function getBreadcrumbs(pathname: string, tFn: (k: keyof typeof translations.zh) => string): { label: string; href?: string }[] {
  const key = pageTitleKeys[pathname];
  return key ? [{ label: tFn(key) }] : [];
}

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const { t: tt } = useI18n();
  const title = tt(pageTitleKeys[location.pathname] ?? 'dashboard');
  const breadcrumbs = getBreadcrumbs(location.pathname, tt);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 桌面端图标栏悬停展开。抗抖动策略（针对点击导航后"来回快速切换"）：
  //  1) 展开立即（跟手），收起延迟 150ms
  //  2) 在侧边栏内按下鼠标后 700ms 内「钉住」不收——点击导航会触发 View Transition，
  //     浏览器把页面换成快照图层，鼠标下方元素瞬间不是侧边栏 → 产生假 mouseleave
  //  3) 收起前用几何判定（elementFromPoint）确认鼠标确实不在侧边栏内
  //  4) 转场进行中（html[data-vt]）不做收起判定，等转场结束后再判（最多重试 4 次）
  const [railOpen, setRailOpen] = useState(false);
  const railTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const railPinnedUntil = useRef(0);
  const railPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const sidebarRef = useRef<HTMLDivElement | null>(null);

  const clearRailTimer = () => {
    if (railTimer.current) { clearTimeout(railTimer.current); railTimer.current = null; }
  };

  const openRail = () => {
    clearRailTimer();
    setRailOpen(true);
  };

  const closeRail = (attempt = 0) => {
    clearRailTimer();
    railTimer.current = setTimeout(() => {
      if (Date.now() < railPinnedUntil.current) return;          // 点击后的钉住窗口
      if (document.documentElement.dataset.vt) {                 // 转场中：延后重判
        if (attempt < 4) closeRail(attempt + 1);
        return;
      }
      const { x, y } = railPointer.current;
      const under = (x || y) ? document.elementFromPoint(x, y) : null;
      if (under && sidebarRef.current?.contains(under)) return;  // 鼠标仍在侧边栏 → 不收起
      setRailOpen(false);
    }, attempt === 0 ? 150 : 250);
  };
  useBranding();

  // Touch tracking for swipe-left-to-close gesture on the mobile sidebar overlay.
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const delta = touchCurrentX.current - touchStartX.current;
    // Detect a leftward swipe (negative X delta beyond a threshold) to close.
    if (delta < -50) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 relative overflow-x-clip">
      {/* Subtle colorful blobs behind glass cards */}
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-violet-200/20 rounded-full blur-[150px] pointer-events-none z-0" />
      <div className="fixed bottom-0 left-0 w-[500px] h-[500px] bg-fuchsia-200/10 rounded-full blur-[120px] pointer-events-none z-0" />
      {/* Mobile hamburger menu button */}
      <button
        className="fixed top-3 left-3 z-50 md:hidden p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-gray-100 transition-colors"
        onClick={() => setSidebarOpen(true)}
        aria-label="打开侧边栏菜单"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay backdrop — swipe left to close */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - 移动端抽屉；桌面端为图标栏（rail），悬停平滑展开并推挤内容区 */}
      <div
        className={`
          group/sidebar fixed left-0 top-0 bottom-0 z-40 vt-sidebar overflow-hidden
          border-r border-gray-300 dark:border-gray-700
          transform transition-[width,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[width]
          w-60 ${railOpen ? 'md:w-60' : 'md:w-[72px]'}
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        ref={sidebarRef}
        onMouseEnter={(e) => { railPointer.current = { x: e.clientX, y: e.clientY }; openRail(); }}
        onMouseMove={(e) => { railPointer.current = { x: e.clientX, y: e.clientY }; }}
        onMouseLeave={(e) => { railPointer.current = { x: e.clientX, y: e.clientY }; closeRail(); }}
        onMouseDown={() => { railPinnedUntil.current = Date.now() + 700; }}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} railOpen={railOpen} />
      </div>

      {/* Main content - 边距与侧边栏宽度同步过渡 */}
      <div
        className={`bg-tech-dots transform transition-[margin] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          railOpen ? 'md:ml-60' : 'md:ml-[72px]'
        }`}
      >
        <Topbar
          title={title}
          breadcrumb={breadcrumbs}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="p-6 vt-content">
          <Outlet />
        </main>
      </div>

      {/*
        所有 fixed 浮层必须放在上面那个带 transform 的容器「之外」。

        CSS 规范：祖先元素带 transform 时，其 position: fixed 的后代会改为
        **相对该祖先**定位，而不是相对视口。实测踩坑：FeedbackWidget 一直写在
        `bottom-24 right-6`，但因为被这个容器裹着，实际落在视口偏上
        （bottom 实测 670px，而 24px 才是预期），且引导层的全屏遮罩也铺不满。
        AIAssistant 当初就是因此被移出来的 —— 这里把剩下两个补齐。
      */}
      <FeedbackWidget />
      <OnboardingWizard />
      <AIAssistant />
    </div>
  );
};