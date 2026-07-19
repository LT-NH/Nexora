import React, { forwardRef } from 'react';
import { AlertCircle } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className = '', ...props }, ref) => {
    const errorId = props.id ? `${props.id}-error` : undefined;
    const hintId = props.id ? `${props.id}-hint` : undefined;
    const describedBy = [error && errorId, hint && !error && hintId]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              block w-full rounded-lg border px-3 py-2 text-sm
              placeholder:text-gray-500 dark:placeholder:text-gray-400
              transition-colors duration-200 transition-shadow duration-200
              focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-400 focus:ring-offset-0
              disabled:bg-gray-50 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed
              ${leftIcon ? 'pl-10' : ''}
              ${rightIcon ? 'pr-10' : ''}
              ${
                error
                  ? 'border-red-300 dark:border-red-500/50 focus:border-red-500 focus:ring-red-200 text-red-900 dark:text-red-300'
                  : 'border-gray-300 dark:border-gray-600 focus:border-primary-400 focus:ring-primary-100 text-gray-900 dark:text-gray-100 dark:bg-gray-800'
              }
              ${className}
            `}
            aria-describedby={describedBy}
            aria-invalid={error ? 'true' : undefined}
            {...props}
          />
          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500">
              {rightIcon}
            </div>
          )}
          {error && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-red-500">
              <AlertCircle size={16} />
            </div>
          )}
        </div>
        {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
        {hint && !error && (
          <p className="mt-1.5 text-sm text-gray-500">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';