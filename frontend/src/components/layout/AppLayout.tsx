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

      {/* Sidebar - hidden on mobile, slides in when open */}
      <div
        className={`
          fixed left-0 top-0 bottom-0 z-40 vt-sidebar
          transform transition-transform duration-300 ease-in-out
          md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="md:ml-64 bg-tech-dots">
        <Topbar
          title={title}
          breadcrumb={breadcrumbs}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="p-6 vt-content">
          <Outlet />
        </main>
        <FeedbackWidget />
        <OnboardingWizard />
      </div>

      {/* Floating AI assistant — rendered outside the main content area so it
          overlays every page via fixed positioning. */}
      <AIAssistant />
    </div>
  );
};