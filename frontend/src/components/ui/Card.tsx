import React from 'react';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  padding?: boolean;
  hover?: boolean;
  glass?: boolean;
  style?: React.CSSProperties;
  'aria-label'?: string;
  role?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  actions,
  className = '',
  padding = true,
  hover = false,
  glass = false,
  style,
  'aria-label': ariaLabel,
  role,
}) => {
  return (
    <div
      // 默认走统一的 surface-2（圆角/边框/阴影/内高光全部来自 index.css 的
      // 设计 token），而不是每个页面各写一套 bg-white + border + shadow。
      // 同时保留 glass 开关 —— 显式传 glass 的页面仍然可拿到玻璃拟态。
      className={`overflow-hidden ${
        glass ? 'glass-card' : `surface-2 ${hover ? 'is-interactive' : ''}`
      } ${className}`}
      style={style}
      role={role}
      aria-label={ariaLabel}
    >
      {(title || subtitle || actions) && (
        <div
          className={`flex items-center justify-between ${
            padding ? 'px-6 pt-5 pb-0' : 'px-0 pt-0 pb-0'
          }`}
        >
          <div>
            {title && (
              <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{title}</h3>
            )}
            {subtitle && (
              <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padding ? 'p-6' : ''}>{children}</div>
    </div>
  );
};