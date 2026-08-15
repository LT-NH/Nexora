import React from 'react';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'primary' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-success-50 text-success-700 border border-success-200',
  danger: 'bg-danger-50 text-danger-700 border border-danger-200',
  warning: 'bg-warning-50 text-warning-700 border border-warning-200',
  primary: 'bg-primary-50 text-primary-700 border border-primary-200',
  neutral: 'bg-gray-50 text-gray-600 border border-gray-200',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  className = '',
}) => {
  return (
    <span
      className={`
        inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
        transition-all duration-200
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
};