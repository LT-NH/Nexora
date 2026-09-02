import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, Bell, Search, Menu, Package, ShoppingBag, UserCheck, CheckCircle, AlertTriangle, XCircle, Info, Megaphone, Sun, Moon, Monitor, Home } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useTheme } from '@/hooks/useTheme';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { Avatar } from '@/components/ui/Avatar';
import { Dropdown } from '@/components/ui/Dropdown';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Settings } from 'lucide-react';
import api from '@/services/api';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useWebSocketNotifications } from '@/hooks/useWebSocketNotifications';
import { useI18n } from '@/i18n';
import { withThemeTransition } from '@/lib/viewTransition';

interface TopbarProps {
  title: string;
  breadcrumb?: { label: string; href?: string }[];
  onMenuClick?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ title, breadcrumb, onMenuClick }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { t: tt } = useI18n();

  const themeIcon = theme === 'dark' ? <Moon size={18} /> : theme === 'light' ? <Sun size={18} /> : <Monitor size={18} />;
  const themeLabel = theme === 'dark' ? tt('theme_dark') : theme === 'light' ? tt('theme_light') : tt('theme_system');

  const userMenuItems = [
    ...(user?.is_superadmin
      ? [
          {
            label: '平台管理',
            value: 'admin',
            icon: <ShieldCheck size={16} />,
            onClick: () => navigate('/admin'),
          },
        ]
      : []),
    {
      label: tt('profile'),
      value: 'profile',
      icon: <User size={16} />,
      onClick: () => navigate('/profile'),
    },
    {
      label: tt('settings'),
      value: 'settings',
      icon: <Settings size={16} />,
      onClick: () => navigate('/settings'),
    },
    {
      label: tt('logout'),
      value: 'logout',
      icon: <LogOut size={16} />,
      danger: true,
      onClick: logout,
    },
  ];

  return (
    <header
      className="vt-topbar relative min-h-[4rem] bg-white dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* 品牌色条：与左侧侧边栏顶部的色带连成一条贯穿全宽的线 */}
      <div aria-hidden className="absolute top-0 left-0 right-0 h-1 brand-accent-bar" />
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400 transition-colors flex-shrink-0"
          onClick={onMenuClick}
          aria-label={tt('open_sidebar')}
        >
          <Menu size={20} />
        </button>
        {/* Home page button */}
        <button
          onClick={() => navigate('/')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20 transition-colors"
          title={tt('back_home')}
        >
          <Home size={16} />
          <span>{tt('home')}</span>
        </button>
        <div className="min-w-0">
          {breadcrumb && breadcrumb.length > 0 && (
            <nav className="flex items-center gap-1 text-xs sm:text-sm text-gray-500 mb-0.5 overflow-hidden">
              <span className="truncate max-w-[120px] sm:max-w-[200px]">
                {breadcrumb.map((item, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <span className="text-gray-300 dark:text-gray-600 mx-0.5">•</span>}
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
              </span>
            </nav>
          )}
          <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-gray-100 truncate max-w-[140px] sm:max-w-[300px]">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
        {/* Mobile search icon */}
        <MobileSearchButton />

        {/* Language toggle */}
        <LanguageToggle />

        {/* Desktop search bar */}
        <SearchBar />

        {/* Notifications */}
        <NotificationBell />

        {/* Theme Toggle（点击位置为圆心的涟漪过渡） */}
        <button
          onClick={(e) => {
            const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
            withThemeTransition(toggleTheme, r.left + r.width / 2, r.top + r.height / 2);
          }}
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
              <Avatar src={user?.avatar_url} name={user?.full_name || tt('user')} size="sm" />
            </button>
          }
          items={userMenuItems}
          align="right"
        />
      </div>
    </header>
  );
};

const MobileSearchButton: React.FC = () => {
  const navigate = useNavigate();
  const { t: tt } = useI18n();
  const [showOverlay, setShowOverlay] = useState(false);
  const { query, setQuery, results, loading } = useGlobalSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showOverlay) {
      inputRef.current?.focus();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setQuery('');
    }
    return () => { document.body.style.overflow = ''; };
  }, [showOverlay, setQuery]);

  const handleResultClick = (path: string) => {
    setShowOverlay(false);
    setQuery('');
    // 相同路径时加时间戳强制路由变化（否则 React Router 不重新渲染）
    const target = window.location.pathname === path.split('?')[0]
      ? `${path}${path.includes('?') ? '&' : '?'}ts=${Date.now()}`
      : path;
    navigate(target);
  };

  return (
    <>
      <button
        className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setShowOverlay(true)}
        aria-label={tt('search')}
      >
        <Search size={20} />
      </button>
      {showOverlay && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
          <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-200 dark:border-gray-800">
            <Search size={20} className="text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder={tt('search_placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 text-base bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
            />
            <button
              onClick={() => setShowOverlay(false)}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium"
            >
              取消
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-sm text-gray-500">{tt('searching')}</div>
            ) : !results || (!results.products?.length && !results.orders?.length && !results.customers?.length) ? (
              <div className="p-8 text-center text-sm text-gray-400">{query ? tt('no_results') : tt('search_hint')}</div>
            ) : (
              <>
                {results.products?.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase bg-gray-50 dark:bg-gray-800">{tt('products')}</div>
                    {results.products.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => handleResultClick(`/products?id=${p.id}`)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between border-b border-gray-100 dark:border-gray-800"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                            <Package size={14} className="text-primary-600" />
                          </div>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</span>
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">¥{p.price}</span>
                      </button>
                    ))}
                  </div>
                )}
                {results.orders?.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase bg-gray-50 dark:bg-gray-800">{tt('orders')}</div>
                    {results.orders.map((o: any) => (
                      <button
                        key={o.id}
                        onClick={() => handleResultClick(`/orders/${o.id}`)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between border-b border-gray-100 dark:border-gray-800"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                            <ShoppingBag size={14} className="text-primary-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{o.order_number}</p>
                            <p className="text-xs text-gray-500 truncate">{o.customer_name || tt('unknown_customer')}</p>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">¥{o.total}</span>
                      </button>
                    ))}
                  </div>
                )}
                {results.customers?.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase bg-gray-50 dark:bg-gray-800">{tt('customers')}</div>
                    {results.customers.map((c: any) => (
                      <button
                        key={c.id}
                        onClick={() => handleResultClick(`/customers?id=${c.id}`)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between border-b border-gray-100 dark:border-gray-800"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                            <UserCheck size={14} className="text-primary-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.name}</p>
                            <p className="text-xs text-gray-500 truncate">{c.email || c.phone || ''}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const SearchBar: React.FC = () => {
  const navigate = useNavigate();
  const { t: tt } = useI18n();
  const { query, setQuery, results, loading } = useGlobalSearch();
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Toggle the dropdown based on whether the shared search hook returned hits.
  useEffect(() => {
    if (!results) {
      setShowResults(false);
      return;
    }
    const hasResults =
      results.products?.length > 0 ||
      results.orders?.length > 0 ||
      results.customers?.length > 0;
    setShowResults(hasResults);
  }, [results]);

  const handleResultClick = (path: string) => {
    setShowResults(false);
    setQuery('');
    // 相同路径时加时间戳强制路由变化（否则 React Router 不重新渲染）
    const target = window.location.pathname === path.split('?')[0]
      ? `${path}${path.includes('?') ? '&' : '?'}ts=${Date.now()}`
      : path;
    navigate(target);
  };

  return (
    <div ref={searchRef} className="relative hidden md:block flex-1 max-w-md mx-4">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        placeholder={`${tt('search_placeholder')} (Ctrl+/)`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results && setShowResults(true)}
        className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-100 focus:bg-white dark:focus:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-all"
      />
      {showResults && results && (
        <div className="absolute top-full mt-1 w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-300 dark:border-gray-600 z-50 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-500">{tt('searching')}</div>
          ) : !results.products?.length && !results.orders?.length && !results.customers?.length ? (
            <div className="p-4 text-center text-sm text-gray-500">{tt('no_results')}</div>
          ) : (
            <>
              {results.products?.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">{tt('products')}</div>
                  {results.products.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => handleResultClick(`/products?id=${p.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/30 dark:to-purple-900/30 flex items-center justify-center flex-shrink-0">
                          <Package size={13} className="text-primary-600" />
                        </div>
                        <span className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">{p.name}</span>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">¥{p.price}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.orders?.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">{tt('orders')}</div>
                  {results.orders.map((o: any) => (
                    <button
                      key={o.id}
                      onClick={() => handleResultClick(`/orders/${o.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/30 dark:to-purple-900/30 flex items-center justify-center flex-shrink-0">
                          <ShoppingBag size={13} className="text-primary-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">{o.order_number}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{o.customer_name || tt('unknown_customer')}</p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">¥{o.total}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.customers?.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">{tt('customers')}</div>
                  {results.customers.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => handleResultClick(`/customers?id=${c.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between gap-3 border-b border-gray-50 dark:border-gray-700 last:border-0 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/30 dark:to-purple-900/30 flex items-center justify-center flex-shrink-0">
                          <UserCheck size={13} className="text-primary-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">{c.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.email || c.phone || ''}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const NotificationBell: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const { t: tt } = useI18n();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  // Holds the active polling interval id so we can start/stop it on tab hide/show.
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // --- Real-time notifications over WebSocket ---
  const { notifications: wsNotifications, connected: wsConnected, markRead: wsMarkRead, clearAll: wsClearAll } = useWebSocketNotifications();
  // Tracks WebSocket messages already merged into `notifications` to avoid duplicates.
  const processedWsKeys = useRef<Set<string>>(new Set());
  // Tracks every notification id currently shown (HTTP or WS) for cross-channel dedup.
  const knownIdsRef = useRef<Set<string>>(new Set());
  // Number of WebSocket-delivered notifications merged since the last unread-count sync.
  const wsMergedSinceFetchRef = useRef(0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Merge newly-arrived WebSocket notifications into the list (prepend), once each.
  // WebSocket messages are normalized to the same shape as HTTP notifications so they
  // render uniformly. The unread counter is bumped in real time.
  useEffect(() => {
    if (wsNotifications.length === 0) return;
    const newOnes: any[] = [];
    for (const ws of wsNotifications) {
      const d = ws.data && typeof ws.data === 'object' ? ws.data : {};
      const hasServerId = d.id != null;
      // Deterministic dedup key: prefer server id, otherwise fall back to event+payload.
      const dedupKey = hasServerId ? `id:${d.id}` : `ws:${ws.event}:${JSON.stringify(ws.data ?? '')}`;
      if (processedWsKeys.current.has(dedupKey)) continue;
      processedWsKeys.current.add(dedupKey);
      // Skip if the same notification is already shown from the HTTP channel.
      if (hasServerId && knownIdsRef.current.has(String(d.id))) continue;
      if (hasServerId) knownIdsRef.current.add(String(d.id));
      newOnes.push({
        id: hasServerId ? d.id : `ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: d.title ?? ws.event,
        message: d.message ?? '',
        notification_type: d.notification_type ?? d.type ?? 'info',
        created_at: d.created_at ?? new Date().toISOString(),
        is_read: false,
        link: d.link ?? null,
        _source: 'ws',
      });
    }
    if (newOnes.length > 0) {
      wsMergedSinceFetchRef.current += newOnes.length;
      setNotifications((prev) => [...newOnes, ...prev].slice(0, 50));
      setUnreadCount((prev) => prev + newOnes.length);
    }
  }, [wsNotifications]);

  useEffect(() => {
    if (!currentWorkspace) return;

    // AbortController to cancel in-flight HTTP requests on unmount / re-run.
    const abortController = new AbortController();

    const fetchNotifications = async () => {
      try {
        // 始终同时拉取列表 + 未读数：即使 WebSocket 在线，列表也以 HTTP 为基础，
        // WS 只负责实时增量追加（见下方 wsNotifications 合并，knownIds 去重避免重复）。
        // 仅靠 WS 会导致历史公告永远无法出现在列表中（WS 不重放历史消息）。
        const [notifRes, countRes] = await Promise.all([
          api.get(`/workspaces/${currentWorkspace.slug}/notifications?limit=10`, { signal: abortController.signal }),
          api.get(`/workspaces/${currentWorkspace.slug}/notifications/count`, { signal: abortController.signal }),
        ]);
        const list = notifRes.data || [];
        setNotifications(list);
        knownIdsRef.current = new Set(list.map((n: any) => String(n.id)));
        wsMergedSinceFetchRef.current = 0;
        setUnreadCount(countRes.data?.unread_count || 0);
      } catch (err: any) {
        // Silently ignore aborted requests (expected on unmount / re-run)
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        // silently fail
      }
    };

    // Poll the full list + count every 60s as the base channel; the WebSocket
    // adds real-time increments on top (deduped by server id).
    const interval = 60000;

    const startPolling = () => {
      // Avoid leaking duplicate intervals if already running.
      if (intervalRef.current) return;
      intervalRef.current = setInterval(fetchNotifications, interval);
    };
    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };

    // Initial fetch + start polling while the tab is visible.
    fetchNotifications();
    startPolling();

    // Pause polling when the tab is hidden; resume (and refresh immediately) on return.
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchNotifications();
        startPolling();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      abortController.abort();
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentWorkspace, wsConnected]);

  const handleMarkAllRead = async () => {
    if (!currentWorkspace) return;
    try {
      await api.post(`/workspaces/${currentWorkspace.slug}/notifications/mark-read`);
      // Clear the real-time buffer so the count stays in sync.
      wsClearAll();
      wsMergedSinceFetchRef.current = 0;
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {}
  };

  const handleNotificationClick = (notif: any) => {
    wsMarkRead(String(notif.id));
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
    announcement: <Megaphone size={14} className="text-[#EB9D2A]" />,
  };

  return (
    <div ref={bellRef} className="relative">
      <button
        className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setShowDropdown(!showDropdown)}
        aria-label={tt('notifications')}
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
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                title={wsConnected ? tt('ws_connected') : tt('ws_polling')}
              />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-gray-100">{tt('notifications')}</h3>
            </div>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-primary-600 hover:text-primary-500">
                全部已读
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">{tt('no_notifications')}</div>
            ) : (
              notifications.map((n: any) => (
                <button
                  key={String(n.id)}
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
