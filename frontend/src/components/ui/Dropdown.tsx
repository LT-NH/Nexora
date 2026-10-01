import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface DropdownItem {
  label: string;
  value: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
}

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}

/** 与面板的 w-56 保持一致；fixed 定位需要知道宽度才能算坐标 */
const MENU_WIDTH = 224;
/** 与面板的 mt-2 对应 */
const MENU_GAP = 8;
/** 距视口边缘的最小留白 */
const VIEWPORT_PADDING = 8;
/** 单项高度估算：py-2.5(10×2) + text-sm 行高(20) ≈ 40px */
const MENU_ITEM_HEIGHT = 40;
/** 面板上下内边距 py-1 × 2 */
const MENU_PADDING_Y = 8;

/**
 * Dropdown —— 菜单通过 Portal 渲染到 body。
 *
 * ## 为什么必须 Portal（这不是洁癖，是修 bug）
 *
 * 工作空间切换菜单放在侧边栏里，而侧边栏有两个特性：
 *   1. `overflow-hidden`
 *   2. 宽度在 240px ↔ 72px 之间做 300ms 过渡（鼠标移入展开、移出收起）
 *
 * 于是：点开菜单后鼠标一移开，侧栏收缩到 72px，菜单被 overflow-hidden
 * 裁到只剩 72px —— 用户看到的是文字被「挤断」。菜单自身宽度（224px）是对的，
 * 问题全在被祖先裁剪。
 *
 * Portal 到 body 后，面板不再受任何祖先的 overflow / transform / z-index 影响。
 * 顺带保证了顶栏、卡片里等其他位置的 Dropdown 也不会再踩同一个坑。
 */
export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  align = 'right',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  /** trigger 所在的容器（用于点击外部判定） */
  const rootRef = useRef<HTMLDivElement>(null);
  /** 面板本身 —— 它在 body 里，不在 rootRef 内，判定时要单独检查 */
  const listRef = useRef<HTMLDivElement>(null);

  // ── 定位 ────────────────────────────────────────────────
  const updatePosition = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuHeight = items.length * MENU_ITEM_HEIGHT + MENU_PADDING_Y;

    /*
      上方空间不够时向上翻转。
      侧栏底部的用户菜单就属于这种情况：trigger 的 bottom 已经接近视口底部，
      面板朝下展开会整块跑到屏幕外。旧实现用 absolute + 祖先 overflow-hidden，
      面板被裁掉所以这个毛病一直没暴露；改成 Portal 完整渲染后才显现。
    */
    const spaceBelow = window.innerHeight - r.bottom - MENU_GAP;
    const spaceAbove = r.top - MENU_GAP;
    const flipUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;

    const top = flipUp
      ? Math.max(VIEWPORT_PADDING, r.top - MENU_GAP - menuHeight)
      : r.bottom + MENU_GAP;

    const rawLeft = align === 'right' ? r.right - MENU_WIDTH : r.left;
    const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING;

    setPos({
      top,
      left: Math.min(
        Math.max(VIEWPORT_PADDING, rawLeft),
        Math.max(VIEWPORT_PADDING, maxLeft)
      ),
    });
  }, [align, items.length]);

  useEffect(() => {
    if (!isOpen) {
      setPos(null);
      return;
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    // capture 阶段监听滚动：面板可能挂在任意可滚动容器内的 trigger 上
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // ── 点击外部关闭 ────────────────────────────────────────
  // 面板已不在 rootRef 的子树里，必须两个都判断，否则点面板会误判为「外部点击」
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setIsOpen(false);
      setActiveIndex(-1);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          setIsOpen(true);
          setActiveIndex(0);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < items.length) {
            const item = items[activeIndex];
            if (item.onClick) item.onClick();
            setIsOpen(false);
            setActiveIndex(-1);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setActiveIndex(-1);
          break;
        case 'Tab':
          setIsOpen(false);
          setActiveIndex(-1);
          break;
      }
    },
    [isOpen, items, activeIndex]
  );

  const handleItemClick = (item: DropdownItem) => {
    if (item.onClick) {
      item.onClick();
    }
    setIsOpen(false);
    setActiveIndex(-1);
  };

  // Focus the active item when it changes
  useEffect(() => {
    if (isOpen && listRef.current && activeIndex >= 0) {
      const buttons = listRef.current.querySelectorAll('button');
      if (buttons[activeIndex]) {
        buttons[activeIndex].focus();
      }
    }
  }, [isOpen, activeIndex]);

  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer"
        role="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        tabIndex={0}
      >
        {trigger}
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={listRef}
            role="menu"
            style={{
              position: 'fixed',
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: MENU_WIDTH,
              // 首帧还没量到位置时先隐藏，避免在左上角闪一下
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="
              rounded-xl bg-white shadow-lg border border-gray-300
              dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200
              py-1 z-[100] animate-dropdown-in
            "
          >
            {items.map((item, index) => (
              <button
                key={item.value || index}
                role="menuitem"
                onClick={() => handleItemClick(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`
                  w-full flex items-center gap-3 px-4 py-2.5 text-sm
                  transition-colors duration-150
                  ${
                    item.danger
                      ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700'
                  }
                  ${index === activeIndex ? 'bg-gray-50 dark:bg-gray-700' : ''}
                `}
              >
                {item.icon && <span className="flex-shrink-0 w-4 h-4">{item.icon}</span>}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};
