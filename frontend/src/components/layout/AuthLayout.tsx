import React from 'react';
import { Layers, Brain, ShieldCheck, LineChart } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

/**
 * 登录/注册页布局：左侧品牌叙事栏 + 右侧表单。
 *
 * 设计意图（区别于单纯的「渐变底 + logo」占位）：
 *   登录页是潜在客户看到的第一个真实界面。左侧栏承担「30 秒说清
 *   Nexora 是什么、凭什么」的职责，因此用「主张 + 四条能力 + 量化背书」
 *   的组合，而不是堆砌装饰性光斑。
 */
const CAPABILITIES = [
  {
    icon: Layers,
    title: '多渠道订单自动汇聚',
    desc: 'Shopify、抖音、淘宝一次接入，订单不再靠人工导出对齐',
  },
  {
    icon: Brain,
    title: '千问 AI 经营分析',
    desc: '基于真实订单给出补货、定价、清仓建议，不是模板文案',
  },
  {
    icon: LineChart,
    title: '六维经营健康评分',
    desc: '利润、库存、履约、客户、渠道、增长，一屏看清哪里失血',
  },
  {
    icon: ShieldCheck,
    title: '企业级权限与安全',
    desc: '多工作空间隔离，凭据加密存储，操作全程留痕',
  },
];

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title,
  subtitle,
}) => {
  return (
    <div className="min-h-screen flex bg-white dark:bg-gray-950">
      {/* 左栏：品牌叙事（lg 以下隐藏） */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-1/2 bg-gradient-to-br from-primary-600 via-primary-700 to-fuchsia-700 flex-col justify-between p-12 xl:p-16 relative overflow-hidden">
        {/* 装饰：极光球 */}
        <div className="absolute -top-24 -right-24 w-[420px] h-[420px] bg-fuchsia-400/25 rounded-full blur-3xl pointer-events-none animate-float" />
        <div
          className="absolute -bottom-32 -left-20 w-[380px] h-[380px] bg-violet-400/25 rounded-full blur-3xl pointer-events-none animate-float"
          style={{ animationDelay: '-2.5s', animationDuration: '8s' }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-56 h-56 bg-white/10 rounded-full blur-2xl pointer-events-none animate-float"
          style={{ animationDelay: '-4s', animationDuration: '10s' }}
        />

        {/* 顶部：标识 */}
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/95 backdrop-blur-sm flex items-center justify-center p-1.5 shadow-lg">
            <img
              src="/favicon-512.png"
              alt=""
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <div className="text-lg font-bold text-white leading-tight">
              Nexora
            </div>
            <div className="text-[11px] tracking-[0.18em] text-white/70 font-medium">
              ONE CORE, ALL COMMERCE
            </div>
          </div>
        </div>

        {/* 中部：主张 + 能力清单 */}
        <div className="relative my-10">
          <h1 className="text-[2.1rem] xl:text-[2.5rem] font-bold text-white leading-[1.25] tracking-tight">
            一个面板，
            <br />
            管理全部电商渠道
          </h1>
          <p className="mt-4 text-[15px] text-white/85 leading-relaxed max-w-[26rem]">
            订单、库存、客户与利润实时汇聚，AI 不只回答问题，直接告诉你今天该动哪一步。
          </p>

          <ul className="mt-9 space-y-4">
            {CAPABILITIES.map(({ icon: Icon, title: capTitle, desc }) => (
              <li key={capTitle} className="flex items-start gap-3.5">
                <span className="mt-0.5 w-8 h-8 flex-shrink-0 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center">
                  <Icon size={16} className="text-white" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-white leading-snug">
                    {capTitle}
                  </span>
                  <span className="block text-[12.5px] text-white/65 leading-relaxed mt-0.5">
                    {desc}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* 底部：量化背书 */}
        <div className="relative border-t border-white/15 pt-6">
          <div className="grid grid-cols-3 gap-4">
            {[
              { k: '六维', v: '经营健康模型' },
              { k: '实时', v: '跨平台数据同步' },
              { k: '14 天', v: '免费试用' },
            ].map(({ k, v }) => (
              <div key={k}>
                <div className="text-lg font-bold text-white leading-none">
                  {k}
                </div>
                <div className="text-[11.5px] text-white/70 mt-1.5">
                  {v}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧：表单 */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-white dark:bg-gray-950">
        <div className="w-full max-w-md animate-page-in">
          {/* 小屏：顶部品牌条 */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img
              src="/favicon-192.png"
              alt=""
              className="h-10 w-10 object-contain"
            />
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Nexora
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                One Core, All Commerce
              </p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {title}
            </h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
};
