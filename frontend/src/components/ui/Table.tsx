import React, { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';

interface TableColumn<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  key: string | null;
  direction: SortDirection;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  isLoading?: boolean;
  onSort?: (key: string, direction: SortDirection) => void;
  /** Whether to show CSV export button */
  exportable?: boolean;
  /** Filename for CSV export */
  exportFilename?: string;
  /** Whether the header should be sticky */
  stickyHeader?: boolean;
}

function convertToCSV<T>(columns: TableColumn<T>[], data: T[]): string {
  const headers = columns.map((col) => `"${col.header}"`).join(',');
  const rows = data.map((item) =>
    columns
      .map((col) => {
        const raw = col.render ? '' : (item as any)[col.key];
        const str = raw != null ? String(raw).replace(/"/g, '""') : '';
        return `"${str}"`;
      })
      .join(',')
  );
  return [headers, ...rows].join('\n');
}

function downloadCSV(csv: string, filename: string) {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyTitle = '未找到数据',
  emptyDescription = '暂无数据可显示。',
  isLoading = false,
  onSort,
  exportable = false,
  exportFilename = 'export.csv',
  stickyHeader = false,
}: TableProps<T>) {
  const [sort, setSort] = useState<SortState>({ key: null, direction: null });

  const handleSortClick = (col: TableColumn<T>) => {
    if (!col.sortable) return;
    const newDirection: SortDirection =
      sort.key === col.key
        ? sort.direction === 'asc'
          ? 'desc'
          : sort.direction === 'desc'
          ? null
          : 'asc'
        : 'asc';
    const newSort: SortState = { key: newDirection ? col.key : null, direction: newDirection };
    setSort(newSort);
    onSort?.(col.key, newDirection);
  };

  const getSortIcon = (col: TableColumn<T>) => {
    if (!col.sortable) return null;
    if (sort.key !== col.key) return <ArrowUpDown size={14} className="ml-1 opacity-50" />;
    if (sort.direction === 'asc') return <ArrowUp size={14} className="ml-1" />;
    if (sort.direction === 'desc') return <ArrowDown size={14} className="ml-1" />;
    return <ArrowUpDown size={14} className="ml-1 opacity-50" />;
  };

  const handleExport = () => {
    const csv = convertToCSV(columns, data);
    downloadCSV(csv, exportFilename);
  };

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded shimmer" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-gray-500 dark:text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{emptyTitle}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {exportable && (
        <div className="flex justify-end px-4 pt-3 pb-1">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg border border-gray-300 dark:border-gray-600 transition-colors"
          >
            <Download size={14} />
            导出 CSV
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
            <tr className="border-b border-gray-300 dark:border-gray-700">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-white dark:bg-gray-800 ${
                    col.sortable ? 'cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300' : ''
                  } ${col.className || ''}`}
                  onClick={() => handleSortClick(col)}
                >
                  <span className="inline-flex items-center">
                    {col.header}
                    {getSortIcon(col)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {data.map((item, idx) => (
              <tr
                key={keyExtractor(item)}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors animate-fade-in"
                style={{ animationDelay: `${idx * 0.03}s` }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-sm ${col.className || ''}`}
                  >
                    {col.render
                      ? col.render(item)
                      : (item as any)[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
