import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className = '' }) => {
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      role="status"
      aria-label="加载中"
    >
      <div
        className={`${sizeMap[size]} border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin`}
      />
      <span className="sr-only">加载中...</span>
    </div>
  );
};