import React, { useEffect, useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SHORTCUTS = [
  { label: '仪表盘', path: '/dashboard' },
  { label: '商品管理', path: '/products' },
  { label: '订单管理', path: '/orders' },
  { label: '客户管理', path: '/customers' },
  { label: '店铺管理', path: '/stores' },
  { label: '数据分析', path: '/analytics' },
  { label: 'API 密钥', path: '/api-keys' },
  { label: '团队管理', path: '/team' },
  { label: '订阅管理', path: '/billing' },
  { label: '工作空间设置', path: '/workspace-settings' },
];

export const CommandPalette: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const toggle = useCallback(() => setOpen((v) => !v), []);

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

  const filtered = SHORTCUTS.filter((s) =>
    s.label.toLowerCase().includes(query.toLowerCase())
  );

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
    setQuery('');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="搜索页面..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none placeholder-gray-400"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">
            ESC
          </kbd>
        </div>
        <div className="max-h-64 overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">无匹配结果</p>
          )}
          {filtered.map((s) => (
            <button
              key={s.path}
              onClick={() => go(s.path)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-700 dark:hover:text-primary-400 transition-colors text-left"
            >
              <Search size={14} className="text-gray-400 flex-shrink-0" />
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
