import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  Search,
  Package,
  ShoppingBag,
  UserCheck,
  Plus,
  Download,
  Moon,
  CornerUpRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { useI18n } from '@/i18n';
import { useTheme } from '@/hooks/useTheme';
import { withThemeTransition } from '@/lib/viewTransition';

// Filtered results grouped by type
type CommandItem = {
  id: string;
  type: 'page' | 'data' | 'command';
  label: string;
  description?: string;
  icon?: React.ReactNode;
  action: () => void;
};

/**
 * Page shortcuts — kept in sync with the Sidebar nav items so every entry is a
 * real, reachable route. `/analytics` is intentionally omitted (not present in
 * the sidebar) and `/settings` is used instead of the old `/workspace-settings`.
 */
const getPageShortcuts = (tt: (k: any) => string) => [
  { label: tt('dashboard'), path: '/dashboard' },
  { label: tt('products'), path: '/products' },
  { label: tt('orders'), path: '/orders' },
  { label: '客户 CRM', path: '/customers' },
  { label: tt('stores'), path: '/stores' },
  { label: tt('coupons'), path: '/coupons' },
  { label: tt('refunds'), path: '/refunds' },
  { label: tt('permissions'), path: '/permissions' },
  { label: 'Webhooks', path: '/webhooks' },
  { label: tt('team'), path: '/team' },
  { label: tt('billing'), path: '/billing' },
  { label: 'API 密钥', path: '/api-keys' },
  { label: tt('settings'), path: '/settings' },
];

export const CommandPalette: React.FC = () => {

  const { t: tt } = useI18n();
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const { query, setQuery, results, loading } = useGlobalSearch();
  const { toggleTheme } = useTheme();
  const listRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Cmd/Ctrl+K to toggle, Escape to close.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, toggle]);

  // Reset the query & selection whenever the palette is (re)opened.
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open, setQuery]);

  const go = useCallback((path: string) => {
    navigate(path);
    setOpen(false);
  }, [navigate]);

  // ── Page items (filtered by query) ──────────────────────────────────────
  const pageItems: CommandItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return getPageShortcuts(tt)
      .filter((s) => !q || s.label.toLowerCase().includes(q) || s.path.includes(q))
      .map((s) => ({
        id: `page-${s.path}`,
        type: 'page' as const,
        label: s.label,
        description: s.path,
        icon: <CornerUpRight size={14} className="text-gray-400 flex-shrink-0" />,
        action: () => go(s.path),
      }));
  }, [query, go]);

  // ── Data items from global search results ───────────────────────────────
  const dataItems: CommandItem[] = useMemo(() => {
    if (!results) return [];
    const items: CommandItem[] = [];
    results.products?.forEach((p: any) => {
      items.push({
        id: `data-product-${p.id}`,
        type: 'data',
        label: p.name,
        description: `商品 · ¥${p.price}`,
        icon: <Package size={14} className="text-primary-500 flex-shrink-0" />,
        action: () => go(`/products?id=${p.id}`),
      });
    });
    results.orders?.forEach((o: any) => {
      items.push({
        id: `data-order-${o.id}`,
        type: 'data',
        label: o.order_number,
        description: `订单 · ${o.customer_name || tt('unknown_customer')}`,
        icon: <ShoppingBag size={14} className="text-primary-500 flex-shrink-0" />,
        action: () => go(`/orders/${o.id}`),
      });
    });
    results.customers?.forEach((c: any) => {
      items.push({
        id: `data-customer-${c.id}`,
        type: 'data',
        label: c.name,
        description: `客户 · ${c.email || c.phone || ''}`,
        icon: <UserCheck size={14} className="text-primary-500 flex-shrink-0" />,
        action: () => go(`/customers?id=${c.id}`),
      });
    });
    return items;
  }, [results, go]);

  // ── Command items (filtered by query) ───────────────────────────────────
  const commandItems: CommandItem[] = useMemo(() => {
    const allCommands: CommandItem[] = [
      {
        id: 'cmd-create-order',
        type: 'command',
        label: '创建订单',
        description: '前往订单页面创建新订单',
        icon: <Plus size={14} className="text-primary-500 flex-shrink-0" />,
        action: () => go('/orders'),
      },
      {
        id: 'cmd-export',
        type: 'command',
        label: '导出数据',
        description: '前往订单页面导出 Excel',
        icon: <Download size={14} className="text-primary-500 flex-shrink-0" />,
        action: () => go('/orders'),
      },
      {
        id: 'cmd-toggle-theme',
        type: 'command',
        label: '切换主题',
        description: '在浅色 / 深色模式之间切换',
        icon: <Moon size={14} className="text-primary-500 flex-shrink-0" />,
        action: () => {
          withThemeTransition(toggleTheme, window.innerWidth / 2, 80);
          setOpen(false);
        },
      },
    ];
    const q = query.trim().toLowerCase();
    return allCommands.filter(
      (c) => !q || c.label.toLowerCase().includes(q) || (c.description?.toLowerCase().includes(q)),
    );
  }, [query, go, toggleTheme]);

  // Flattened, ordered list used for keyboard navigation indexing.
  const allItems = useMemo(
    () => [...pageItems, ...dataItems, ...commandItems],
    [pageItems, dataItems, commandItems],
  );

  // Keep the selection within bounds whenever the result set changes.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, results]);

  // Keyboard navigation: ArrowUp / ArrowDown / Enter.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(allItems.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + Math.max(allItems.length, 1)) % Math.max(allItems.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = allItems[selectedIndex];
      if (item) item.action();
    }
  };

  // Scroll the highlighted item into view as the selection moves.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  const renderGroup = (title: string, items: CommandItem[]) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {title}
        </div>
        {items.map((item) => {
          const idx = allItems.indexOf(item);
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={item.id}
              data-index={idx}
              onClick={() => item.action()}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                isSelected
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              {item.icon}
              <div className="flex-1 min-w-0">
                <span className="block truncate">{item.label}</span>
                {item.description && (
                  <span className="block text-xs text-gray-400 truncate">{item.description}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="搜索页面、数据或操作..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none placeholder-gray-400"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">
            ESC
          </kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
          {loading && (
            <div className="px-3 py-4 text-sm text-gray-400 text-center">搜索中...</div>
          )}
          {!loading && allItems.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">无匹配结果</p>
          )}
          {!loading && renderGroup('页面', pageItems)}
          {!loading && renderGroup('数据', dataItems)}
          {!loading && renderGroup('操作', commandItems)}
        </div>
      </div>
    </div>
  );
};
