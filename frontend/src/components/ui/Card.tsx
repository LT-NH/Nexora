import React from 'react';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  padding?: boolean;
  hover?: boolean;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  actions,
  className = '',
  padding = true,
  hover = false,
  style,
}) => {
  return (
    <div
      className={`overflow-hidden bg-white dark:bg-gray-800 rounded-xl border border-black/[0.04] dark:border-white/[0.06] shadow-sm hover:shadow-md transition-shadow duration-300
        ${hover ? 'hover:shadow-md transition-shadow duration-300' : ''}
        ${className}
      `}
      style={style}
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