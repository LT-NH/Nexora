import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (type: ToastType, title: string, message?: string, action?: { label: string; onClick: () => void }) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const addToast = useCallback(
    (type: ToastType, title: string, message?: string, action?: { label: string; onClick: () => void }) => {
      const id = Math.random().toString(36).substring(2, 9);
      // Ensure message is always a string (prevents React crash from Pydantic error objects)
      const safeMessage = typeof message === 'string' ? message : message !== undefined ? JSON.stringify(message, null, 2) : undefined;
      setToasts((prev) => [...prev, { id, type, title, message: safeMessage, action }]);
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
      timersRef.current.set(id, timer);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(
    () => ({ toasts, addToast, removeToast }),
    [toasts, addToast, removeToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
};

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={20} className="text-success-500 dark:text-green-400" />,
  error: <XCircle size={20} className="text-danger-500 dark:text-red-400" />,
  warning: <AlertTriangle size={20} className="text-warning-500 dark:text-yellow-400" />,
  info: <Info size={20} className="text-primary-500 dark:text-blue-400" />,
};

const bgMap: Record<ToastType, string> = {
  success: 'border-green-200',
  error: 'border-red-200',
  warning: 'border-yellow-200',
  info: 'border-blue-200',
};

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            flex items-start gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg border dark:border-gray-700
            animate-slide-in-right
            ${bgMap[toast.type]}
          `}
        >
          <div className="flex-shrink-0 mt-0.5">{iconMap[toast.type]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-gray-100">{toast.title}</p>
            {toast.message && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{toast.message}</p>
            )}
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.onClick();
                  removeToast(toast.id);
                }}
                className="mt-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};