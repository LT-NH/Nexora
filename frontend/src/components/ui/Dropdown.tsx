import React, { useState, useRef, useEffect, useCallback } from 'react';

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

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  align = 'right',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
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
          setActiveIndex((prev) =>
            prev < items.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : items.length - 1
          );
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
    <div
      ref={dropdownRef}
      className={`relative ${className}`}
      onKeyDown={handleKeyDown}
    >
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
      {isOpen && (
        <div
          ref={listRef}
          role="menu"
          className={`
            absolute mt-2 w-56 rounded-xl bg-white shadow-lg border border-gray-300
            dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200
            py-1 z-50 animate-dropdown-in
            ${align === 'right' ? 'right-0' : 'left-0'}
          `}
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
              {item.icon && (
                <span className="flex-shrink-0 w-4 h-4">{item.icon}</span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};