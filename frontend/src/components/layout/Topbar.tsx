import React, { useState, useEffect, useRef } from 'react';
import { Bell, Search, Menu, Package, ShoppingBag, UserCheck, CheckCircle, AlertTriangle, XCircle, Info, Sun, Moon, Monitor } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown } from '@/components/ui/Dropdown';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Settings } from 'lucide-react';
import api from '@/services/api';

interface TopbarProps {
  title: string;
  breadcrumb?: { label: string; href?: string }[];
  onMenuClick?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ title, breadcrumb, onMenuClick }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const themeIcon = theme === 'dark' ? <Moon size={18} /> : theme === 'light' ? <Sun size={18} /> : <Monitor size={18} />;
  const themeLabel = theme === 'dark' ? '深色模式' : theme === 'light' ? '浅色模式' : '跟随系统';

  const userMenuItems = [
    {
      label: '个人资料',
      value: 'profile',
      icon: <User size={16} />,
      onClick: () => navigate('/profile'),
    },
    {
      label: '设置',
      value: 'settings',
      icon: <Settings size={16} />,
      onClick: () => navigate('/settings'),
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
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400 transition-colors"
          onClick={onMenuClick}
          aria-label="打开侧边栏菜单"
        >
          <Menu size={20} />
        </button>
        <div>
          {breadcrumb && breadcrumb.length > 0 && (
            <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-0.5">
              {breadcrumb.map((item, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <span className="text-gray-300 dark:text-gray-600">/</span>}
                  {item.href ? (
                    <a
                      href={item.href}
                      className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <span className="text-gray-500">{item.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          )}
          <h1 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <SearchBar />

        {/* Notifications */}
        <NotificationBell />

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
          aria-label={themeLabel}
          title={themeLabel}
        >
          {themeIcon}
        </button>

        {/* User Avatar Dropdown */}
        <Dropdown
          trigger={
            <button className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Avatar src={user?.avatar_url} name={user?.full_name || '用户'} size="sm" />
            </button>
          }
          items={userMenuItems}
          align="right"
        />
      </div>
    </header>
  );
};

const SearchBar: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim() || !currentWorkspace) {
      setResults([]);
      setShowResults(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await api.get(
          `/workspaces/${currentWorkspace.slug}/search?q=${encodeURIComponent(value.trim())}`
        );
        const all = [
          ...(response.data.products || []).map((p: any) => ({ ...p, category: '商品' })),
          ...(response.data.orders || []).map((o: any) => ({ ...o, category: '订单' })),
          ...(response.data.customers || []).map((c: any) => ({ ...c, category: '客户' })),
        ];
        setResults(all);
        setShowResults(all.length > 0);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleResultClick = (item: any) => {
    setShowResults(false);
    setQuery('');
    const typeMap: Record<string, string> = { product: '/products', order: '/orders', customer: '/customers' };
    navigate(typeMap[item.type] || '/dashboard');
  };

  return (
    <div ref={searchRef} className="relative hidden md:block">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
      <input
        type="text"
        placeholder="搜索商品、订单、客户..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => results.length > 0 && setShowResults(true)}
        className="w-64 pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-100 focus:bg-white dark:focus:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-all"
      />
      {showResults && (
        <div className="absolute top-full mt-1 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-300 dark:border-gray-600 z-50 max-h-80 overflow-y-auto">
          {isSearching ? (
            <div className="p-4 text-center text-sm text-gray-500">搜索中...</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">无结果</div>
          ) : (
            results.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleResultClick(item)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-50 to-indigo-50 dark:from-primary-900/30 dark:to-indigo-900/30 flex items-center justify-center flex-shrink-0">
                  {item.type === 'product' ? <Package size={14} className="text-primary-600" /> :
                   item.type === 'order' ? <ShoppingBag size={14} className="text-primary-600" /> :
                   <UserCheck size={14} className="text-primary-600" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">
                    {item.name || item.order_number || item.full_name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.category}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const NotificationBell: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!currentWorkspace) return;
      try {
        const [notifRes, countRes] = await Promise.all([
          api.get(`/workspaces/${currentWorkspace.slug}/notifications?limit=10`),
          api.get(`/workspaces/${currentWorkspace.slug}/notifications/count`),
        ]);
        setNotifications(notifRes.data || []);
        setUnreadCount(countRes.data?.unread_count || 0);
      } catch {
        // silently fail
      }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [currentWorkspace]);

  const handleMarkAllRead = async () => {
    if (!currentWorkspace) return;
    try {
      await api.post(`/workspaces/${currentWorkspace.slug}/notifications/mark-read`);
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  const handleNotificationClick = (notif: any) => {
    if (notif.link) {
      navigate(notif.link);
    }
    setShowDropdown(false);
  };

  const typeIcons: Record<string, React.ReactNode> = {
    success: <CheckCircle size={14} className="text-green-500" />,
    warning: <AlertTriangle size={14} className="text-yellow-500" />,
    error: <XCircle size={14} className="text-red-500" />,
    info: <Info size={14} className="text-blue-500" />,
  };

  return (
    <div ref={bellRef} className="relative">
      <button
        className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setShowDropdown(!showDropdown)}
        aria-label="通知"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] bg-red-500 rounded-full border-2 border-white flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>
          </span>
        )}
      </button>
      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-300 dark:border-gray-600 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-gray-100">通知</h3>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-primary-600 hover:text-primary-500">
                全部已读
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">暂无通知</div>
            ) : (
              notifications.map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-start gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0 transition-colors ${
                    !n.is_read ? 'bg-primary-50/30 dark:bg-primary-900/10' : ''
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {typeIcons[n.notification_type] || typeIcons.info}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">{n.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {n.created_at ? new Date(n.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};