import React from 'react';

interface PageHeaderProps {
  title: React.ReactNode;
  /** 页头副标题 / 说明文字 */
  subtitle?: React.ReactNode;
  /** 右侧操作区（按钮、筛选器等） */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * 统一页头：标题 + 副标题 + 右侧操作区。
 * 应用 TYPOGRAPHY v2 字阶（.page-title-v2），进场一次性 fade+slide。
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  className = '',
}) => (
  <div
    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 animate-page-in ${className}`}
  >
    <div className="min-w-0">
      <h1 className="page-title-v2 text-gray-900 dark:text-gray-100 truncate">{title}</h1>
      {subtitle && (
        <p className="hint-text-v2 text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
      )}
    </div>
    {actions && <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">{actions}</div>}
  </div>
);
