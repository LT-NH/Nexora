import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const pageTitles: Record<string, string> = {
  '/dashboard': '仪表板',
  '/products': '商品管理',
  '/orders': '订单管理',
  '/customers': '客户 CRM',
  '/stores': '店铺管理',
  '/team': '团队',
  '/billing': '计费',
  '/api-keys': 'API 密钥',
  '/settings': '工作空间设置',
  '/admin': '管理仪表板',
  '/profile': '个人资料',
};

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Nexora';
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile hamburger menu button */}
      <button
        className="fixed top-3 left-3 z-50 md:hidden p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-gray-100 transition-colors"
        onClick={() => setSidebarOpen(true)}
        aria-label="打开侧边栏菜单"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - hidden on mobile, slides in when open */}
      <div
        className={`
          fixed left-0 top-0 bottom-0 z-40
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
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};