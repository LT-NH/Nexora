import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div
    className={`skeleton-pulse rounded ${className}`}
    aria-hidden="true"
  />
);

export const SkeletonCard: React.FC = () => (
  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700 shadow-sm p-6 space-y-4 animate-fade-in">
    <div className="flex items-center gap-4">
      <Skeleton className="w-12 h-12 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-5/6" />
    <Skeleton className="h-4 w-4/6" />
  </div>
);

export const SkeletonTable: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 4,
}) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700 animate-fade-in">
    <div className="px-6 py-4 border-b border-gray-100">
      <Skeleton className="h-5 w-1/4" />
    </div>
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex items-center gap-4 px-6 py-4">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Skeleton
              key={colIdx}
              className={`h-4 ${colIdx === 0 ? 'w-1/3' : 'w-1/4'}`}
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const SkeletonStatCard: React.FC = () => (
  <div className="bg-white rounded-xl border border-gray-300 shadow-sm p-6 animate-fade-in">
    <div className="flex items-center justify-between">
      <div className="space-y-3 flex-1">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="w-12 h-12 rounded-xl" />
    </div>
  </div>
);