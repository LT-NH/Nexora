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
    <div className="min-h-screen flex">
      {/* Left side - Gradient background */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-800 items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-white/5 rounded-full translate-x-1/4 translate-y-1/4" />
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-white/5 rounded-full" />

        <div className="relative text-center">
          <div className="w-24 h-24 rounded-2xl bg-white/95 backdrop-blur-sm flex items-center justify-center mx-auto mb-6 p-2 shadow-2xl">
            <img src="/nexora-logo.png" alt="Nexora" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Nexora</h1>
          <p className="text-sm text-primary-200 mb-4 tracking-widest uppercase font-medium">
            One Core, All Commerce
          </p>
          <p className="text-lg text-primary-100 max-w-md leading-relaxed">
            构建和扩展您的多租户 SaaS 平台，强大的工作空间管理、团队协作和订阅计费。
          </p>
          <div className="mt-10 flex flex-wrap gap-3 justify-center">
            {[
              '多租户',
              '基于角色的访问控制',
              '订阅管理',
              'API 密钥',
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
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/nexora-logo.png" alt="Nexora" className="h-10 w-10 object-contain" />
            <div>
              <h2 className="text-xl font-bold text-slate-900">Nexora</h2>
              <p className="text-xs text-gray-500">One Core, All Commerce</p>
            </div>
          </div>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-gray-500">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};