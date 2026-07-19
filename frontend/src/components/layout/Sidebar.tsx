import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Key,
  Settings,
  ChevronDown,
  Plus,
  LogOut,
  User,
  ShoppingBag,
  Package,
  Store,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePlan } from '@/hooks/usePlan';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown } from '@/components/ui/Dropdown';

const navItems = [
  { to: '/dashboard', label: '仪表板', icon: LayoutDashboard },
  { to: '/products', label: '商品管理', icon: Package },
  { to: '/orders', label: '订单管理', icon: ShoppingBag },
  { to: '/customers', label: '客户 CRM', icon: UserCheck },
  { to: '/stores', label: '店铺管理', icon: Store },
  { to: '/team', label: '团队', icon: Users },
  { to: '/billing', label: '计费', icon: CreditCard },
  { to: '/api-keys', label: 'API 密钥', icon: Key },
  { to: '/settings', label: '设置', icon: Settings },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const { user, logout } = useAuth();
  const { currentWorkspace, workspaces, setWorkspace, fetchWorkspaces } =
    useWorkspace();
  const plan = usePlan();
  const navigate = useNavigate();

  const planInfo = { free: { label: 'Free', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' }, pro: { label: 'Pro', color: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' }, enterprise: { label: 'Enterprise', color: 'bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 dark:from-amber-900/40 dark:to-yellow-900/30 dark:text-amber-300 border border-amber-300 dark:border-amber-700' } }[plan];

  React.useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleNavClick = () => {
    onNavigate?.();
  };

  const workspaceItems = (Array.isArray(workspaces) ? workspaces : []).map((w) => ({
    label: w.name,
    value: w.id,
    onClick: () => {
      setWorkspace(w);
      onNavigate?.();
    },
  }));

  workspaceItems.push(
    { label: '管理设置', value: 'new', onClick: () => { navigate('/settings'); onNavigate?.(); } },
    { label: '查看全部', value: 'all', onClick: () => { navigate('/dashboard'); onNavigate?.(); } }
  );

  const userMenuItems = [
    {
      label: user?.full_name || '用户',
      value: 'profile',
      icon: <User size={16} />,
      onClick: () => { navigate('/profile'); onNavigate?.(); },
    },
    {
      label: '退出登录',
      value: 'logout',
      icon: <LogOut size={16} />,
      danger: true,
      onClick: logout,
    },
  ];

  return (
    <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-300 dark:border-gray-700 flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-gray-300 dark:border-gray-700 flex-shrink-0">
        <img src="/nexora-logo.png" alt="Nexora" className="h-9 w-9 object-contain" />
        <span className="text-lg font-bold text-slate-900 dark:text-gray-100">Nexora</span>
      </div>

      {/* Workspace Selector */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <Dropdown
          trigger={
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-300 dark:border-gray-600">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-primary-100 to-indigo-100 dark:from-primary-900/30 dark:to-indigo-900/30 flex items-center justify-center flex-shrink-0">
                <img src="/favicon.png" alt="" className="h-4 w-4 object-contain" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate flex-1 text-left">
                {currentWorkspace?.name || '选择工作空间'}
              </span>
              <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
            </button>
          }
          items={workspaceItems}
          align="left"
          className="w-full"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" role="navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={handleNavClick}
            className={({ isActive }: { isActive: boolean }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-primary-900/30 dark:to-indigo-900/30 text-primary-700 dark:text-primary-300 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-slate-900 dark:hover:text-gray-200'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Plan badge */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${planInfo.color}`}>
          {plan === 'enterprise' && '✦ '}{planInfo.label}
        </div>
      </div>

      {/* User Menu */}
      <div className="border-t border-gray-300 dark:border-gray-700 p-3">
        <Dropdown
          trigger={
            <button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Avatar src={user?.avatar_url} name={user?.full_name || '用户'} size="sm" />
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">
                  {user?.full_name}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            </button>
          }
          items={userMenuItems}
          align="right"
        />
      </div>
    </aside>
  );
};