import React from 'react';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title,
  subtitle,
}) => {
  return (
    <div className="min-h-screen flex bg-white dark:bg-gray-950">
      {/* Left side - Gradient background */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-600 via-primary-700 to-fuchsia-700 items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-white/5 rounded-full translate-x-1/4 translate-y-1/4" />
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-white/5 rounded-full" />
        <div className="absolute -top-24 -right-24 w-[420px] h-[420px] bg-fuchsia-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-20 w-[380px] h-[380px] bg-violet-400/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative text-center">
          <div className="w-24 h-24 rounded-2xl bg-white/95 backdrop-blur-sm flex items-center justify-center mx-auto mb-6 p-2 shadow-2xl">
            <img src="/nexora-logo.png" alt="Nexora" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Nexora</h1>
          <p className="text-sm text-primary-200 mb-4 tracking-widest uppercase font-medium">
            One Core, All Commerce
          </p>
          <p className="text-lg text-primary-100 max-w-md leading-relaxed">
            一个面板，管理全部电商渠道。订单、库存、客户与 AI 洞察，实时汇聚于此。
          </p>
          <div className="mt-10 flex flex-wrap gap-3 justify-center">
            {[
              '多平台同步',
              '千问 AI 分析',
              '多工作空间',
              '企业级安全',
            ].map((item) => (
              <span
                key={item}
                className="px-3 py-1.5 rounded-full bg-white/10 text-primary-100 text-sm font-medium backdrop-blur-sm"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white dark:bg-gray-950">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/nexora-logo.png" alt="Nexora" className="h-10 w-10 object-contain" />
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Nexora</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">One Core, All Commerce</p>
            </div>
          </div>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};
