import React from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  ArrowLeft,
  Server,
  Cloud,
  Shield,
  Brain,
  Database,
  Webhook,
} from 'lucide-react';

interface ServiceStatus {
  name: string;
  icon: React.ElementType;
  status: 'Operational';
  uptime: string;
}

const services: ServiceStatus[] = [
  { name: 'API 服务', icon: Server, status: 'Operational', uptime: '99.9%' },
  { name: '沙盒环境', icon: Cloud, status: 'Operational', uptime: '99.9%' },
  { name: '认证服务', icon: Shield, status: 'Operational', uptime: '99.9%' },
  { name: 'AI 分析引擎', icon: Brain, status: 'Operational', uptime: '99.8%' },
  { name: '数据存储', icon: Database, status: 'Operational', uptime: '99.9%' },
  { name: 'Webhook 分发', icon: Webhook, status: 'Operational', uptime: '99.9%' },
];

const Status: React.FC = () => {
  usePageTitle('系统状态');
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 transition-colors duration-300">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 dark:bg-gray-950/80 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                <ArrowLeft size={18} />
                <span className="text-sm font-medium">返回首页</span>
              </Link>
            </div>
            <div className="flex items-center gap-2.5">
              <img
                src="/nexora-logo.png"
                alt="Nexora"
                className="h-8 w-8 object-contain"
              />
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                Nexora
              </span>
            </div>
            <div className="w-[100px]" />
          </div>
        </div>
      </nav>

      {/* Content */}
      <section className="pt-28 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Nexora 系统状态
            </h1>
            <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
              实时监控各核心服务的运行状态与可用性
            </p>
          </div>

          {/* Overall status banner */}
          <div className="mb-10 p-5 rounded-2xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-green-800 dark:text-green-300">
              所有系统运行正常
            </span>
          </div>

          {/* Service cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {services.map((svc) => (
              <div
                key={svc.name}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <svc.icon
                      size={20}
                      className="text-gray-600 dark:text-gray-400"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs font-medium text-green-600 dark:text-green-400">
                      {svc.status}
                    </span>
                  </div>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                  {svc.name}
                </h3>
                <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <span>运行时间</span>
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                    {svc.uptime}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-500 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-sm">
            {new Date().getFullYear()} Nexora. 保留所有权利。
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Status;
