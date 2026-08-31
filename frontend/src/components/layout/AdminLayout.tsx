import React from 'react';
import { LayoutDashboard, Users, CreditCard, ScrollText, ShieldCheck, ArrowLeft, Sparkles, Activity, Building2, MessageSquare, TrendingUp, Megaphone } from 'lucide-react';
import { NavLink, Link } from 'react-router-dom';

const nav = [
  { to: '/admin', label: '平台总览', icon: LayoutDashboard, end: true },
  { to: '/admin/health', label: '租户健康雷达', icon: Activity },
  { to: '/admin/workspaces', label: '工作空间', icon: Building2 },
  { to: '/admin/revenue', label: '营收看板', icon: TrendingUp },
  { to: '/admin/feedback', label: '反馈中心', icon: MessageSquare },
  { to: '/admin/announcements', label: '公告广播', icon: Megaphone },
  { to: '/admin/users', label: '用户管理', icon: Users },
  { to: '/admin/subscriptions', label: '订阅与支付', icon: CreditCard },
  { to: '/admin/audit', label: '审计日志', icon: ScrollText },
];

export const AdminLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex" style={{ background: '#F6F7F1' }}>
      {/* 侧边栏 */}
      <aside className="w-60 bg-[#0b1023] text-white flex flex-col flex-shrink-0">
        <div className="h-1 w-full brand-accent-bar" />
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-white/10 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <ShieldCheck size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">Nexora 管理台</p>
            <p className="text-[10px] text-violet-300/80 leading-tight">Platform Console</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-violet-500/20 text-white border border-violet-400/30 shadow-sm'
                    : 'text-[#8e8e93] hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-white/10 flex-shrink-0">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-xs text-[#8e8e93] hover:text-white transition-colors"
          >
            <ArrowLeft size={14} />
            返回业务端
          </Link>
          <p className="mt-2 text-[10px] text-white/30">操作全部留痕 · Superadmin 专属</p>
        </div>
      </aside>

      {/* 主区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 */}
        <header className="h-14 bg-white border-b border-[#E4E6DC] flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-[#6B7280]">
            <Sparkles size={14} className="text-[#EB9D2A]" />
            平台级运营管理台
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
            Superadmin
          </span>
        </header>
        {/* 内容区：子路由 */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* 子页面通过路由渲染 */}
          <div id="admin-outlet">
            {/* 各管理页面在此渲染 */}
            <AdminRouterOutlet />
          </div>
        </main>
      </div>
    </div>
  );
};

// 子路由出口：由 App.tsx 的嵌套 Route 渲染，这里直接放 Outlet
import { Outlet } from 'react-router-dom';
const AdminRouterOutlet: React.FC = () => <Outlet />;
