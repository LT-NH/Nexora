import React from 'react';
import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center animate-fade-in">
        <p className="text-7xl font-bold text-primary-600 mb-4">404</p>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-100 mb-2">
          页面未找到
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-8">
          抱歉，我们找不到您要查找的页面。它可能已被移动或删除。
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            leftIcon={<ArrowLeft size={16} />}
            onClick={() => window.history.back()}
          >
            返回上页
          </Button>
          <Link to="/dashboard">
            <Button variant="primary" leftIcon={<Home size={16} />}>
              前往仪表板
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};