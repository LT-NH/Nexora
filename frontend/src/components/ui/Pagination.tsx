import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * 计算页码按钮的显示窗口。
 *
 * 抽成纯函数是为了能单测：`Orders` 与 `Customers` 此前各写了一套（一套带开窗、
 * 一套直接罗列全部页码），页数一多行为就不一致。
 *
 * 规则：总页数不超过 `maxButtons` 时全部显示；否则以当前页为中心开窗，
 * 并保证窗口始终落在 [1, totalPages] 内。
 */
export function pageWindow(
  page: number,
  totalPages: number,
  maxButtons = 5,
): number[] {
  if (totalPages <= 0) return [];
  if (totalPages <= maxButtons) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const half = Math.floor(maxButtons / 2);
  let start = page - half;
  if (start < 1) start = 1;
  if (start + maxButtons - 1 > totalPages) start = totalPages - maxButtons + 1;

  return Array.from({ length: maxButtons }, (_, i) => start + i);
}

export interface PaginationProps {
  /** 当前页（从 1 开始） */
  page: number;
  totalPages: number;
  /** 总条数，用于文案 */
  total: number;
  onPageChange: (page: number) => void;
  /**
   * 文案模板，支持 `{total}` / `{page}` / `{totalPages}` 三个占位符。
   * 不传则只渲染按钮，不渲染左侧文案。
   */
  label?: string;
  /** 最多显示多少个页码按钮（默认 5） */
  maxButtons?: number;
  className?: string;
}

/**
 * 列表分页控件。
 *
 * 统一了此前散落在各页面的两份实现：左侧「共 N 条，第 x/y 页」文案 +
 * 上一页 / 页码窗口 / 下一页。页数不足两页时由调用方决定是否渲染（保持原行为）。
 */
export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  total,
  onPageChange,
  label,
  maxButtons = 5,
  className = '',
}) => {
  const pages = pageWindow(page, totalPages, maxButtons);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      {label ? (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {label
            .replace('{total}', String(total))
            .replace('{page}', String(page))
            .replace('{totalPages}', String(totalPages))}
        </span>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeft size={14} />
        </Button>

        {pages.map((pageNum) => (
          <Button
            key={pageNum}
            variant={pageNum === page ? 'primary' : 'outline'}
            size="sm"
            onClick={() => onPageChange(pageNum)}
          >
            {pageNum}
          </Button>
        ))}

        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="下一页"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
};

export default Pagination;
