import React from 'react';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

/**
 * 登录/注册页布局：左侧品牌栏 + 右侧表单。
 *
 * ## 这一版为什么这么设计
 *
 * 上一版是「深紫底 + 浓紫光斑 + 毛玻璃卡」的暗场皮肤。单独看成立，但它是
 * 全站**唯一**的大面积深紫色：落地页首屏是纯浅色（`bg-white/80`），产品内是
 * `bg-slate-50` + 极淡柔光，暗色模式则是中性蓝黑。从落地页点「登录」进来
 * 像换了一个产品 —— 访客感知到的就是「风格不符」。
 *
 * 这一版把左栏拉回**与全站同一套语言**：
 *   · 浅灰底（`bg-slate-50`，与 AppLayout 一致）+ 大半径低饱和柔光
 *   · 大标题沿用落地页首屏的处理：深灰字 + 紫粉渐变强调行
 *   · 产品片段从「悬浮玻璃片」换成产品内的 surface-2 卡（白卡 / 轻边框 / 内高光），
 *     让它看起来像是从 Dashboard 上截下来的一张卡
 *   · 玻璃拟态本就是 index.css 里被明确收敛掉的旧语言（见「设计 token · 材质层级」）
 *
 * 文字块保持 5 个（上一版已从 13 个收敛）；这一版只换皮，不换内容。
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  title,
  subtitle,
}) => {
  return (
    <div className="min-h-screen flex bg-white dark:bg-gray-950">
      {/* ── 左栏：品牌栏（lg 以下隐藏）───────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-1/2 relative overflow-hidden bg-slate-50 dark:bg-[#0f1520] border-r border-gray-200/80 dark:border-gray-800 grain">
        {/* 两束柔光：半径大、饱和度低（与 AppLayout 的 violet-200/20 同档），
            只负责让浅底不死平 —— 上一版 0.42 不透明度的紫光在浅色语境里会变成新的噪点。 */}
        <div
          aria-hidden="true"
          className="absolute -top-40 -left-32 w-[560px] h-[560px] rounded-full pointer-events-none bg-violet-200/45 blur-[130px] dark:bg-violet-500/[0.09]"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-44 -right-28 w-[520px] h-[520px] rounded-full pointer-events-none bg-fuchsia-200/35 blur-[130px] dark:bg-fuchsia-500/[0.07]"
        />

        {/*
          内容列：限宽后水平居中 —— 与右栏表单同一套处理（那边是 max-w-md + mx-auto）。
          上一版所有内容左对齐贴边，而左栏宽 = 52% 视口：1440 时右侧空 300px、
          1920 时空 550px；两栏一个居中、一个贴边，整页重心因此明显偏左。
        */}
        <div className="relative z-10 flex-1 flex flex-col justify-between w-full max-w-[38rem] mx-auto p-12 xl:p-16">
          {/* 顶部：品牌标识 */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center p-1.5 shadow-sm">
              <img src="/favicon-512.png" alt="" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="text-[17px] font-bold text-[#1d1d1f] dark:text-white leading-tight tracking-tight">
                Nexora
              </div>
              <div className="text-[10px] tracking-[0.2em] text-[#8e8e93] dark:text-gray-500 font-medium mt-0.5">
                ONE CORE, ALL COMMERCE
              </div>
            </div>
          </div>

          {/* 中部：主张 + 产品片段 */}
          <div className="my-10">
            {/* 与落地页首屏同款处理：深灰字 + 紫粉渐变强调行（品牌连续性就靠这一句） */}
            <h1 className="text-[2.15rem] xl:text-[2.5rem] font-semibold leading-[1.2] tracking-tight text-[#1d1d1f] dark:text-white">
              一个面板，
              <br />
              <span className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-500 bg-clip-text text-transparent">
                管理全部电商渠道
              </span>
            </h1>
            <p className="mt-5 text-[14.5px] text-[#515154] dark:text-gray-400 leading-relaxed">
              订单、库存、客户与利润实时汇聚 —— 而且它不只给报表，会直接告诉你今天该动哪一步。
            </p>

            {/*
              产品片段：这是整栏唯一「能证明自己」的东西。
              与其写四行「AI 智能分析」，不如让用户看见一条真实的建议长什么样。

              用产品内的 surface-2（白卡 / 轻边框 / 内高光）而不是悬浮玻璃片：
              它要看起来像「从 Dashboard 上截下来的一张卡」，而不是落地页的装饰浮卡。

              这是**展示**而非可操作控件：用 span 而非 button（不进入 Tab 顺序），
              加 select-none / cursor-default 避免误以为可点。
              不加 aria-hidden —— 它是有意义的品牌内容，只是不可交互。
            */}
            <div className="mt-10 max-w-[27rem] surface-2 p-5 select-none cursor-default">
              <div className="flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <span className="text-[10.5px] font-medium tracking-wide text-[#8e8e93] dark:text-gray-400">
                  经营健康引擎 · 今日建议
                </span>
              </div>

              <p className="mt-3 text-[15px] font-semibold text-[#111827] dark:text-gray-100 leading-snug">
                紧急补货 6 款零库存商品
              </p>

              <div className="mt-2.5 flex items-center gap-2 text-[12px] text-[#6e6e73] dark:text-gray-400 tabular-nums">
                <span>库存归零</span>
                <span className="w-px h-3 bg-gray-200 dark:bg-gray-700" />
                <span>预计损失 ¥3,200</span>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <span className="rounded-lg bg-gradient-to-br from-violet-600 to-violet-700 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm shadow-violet-500/25">
                  立即处理
                </span>
                <span className="text-[11px] text-[#8e8e93] dark:text-gray-500">AI 已排序其余 60 条</span>
              </div>
            </div>
          </div>

          {/* 底部：三个短语（原来这里是 4 条带描述的能力列表） */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-[#8e8e93] dark:text-gray-500">
            <span>多平台订单汇聚</span>
            <span aria-hidden="true" className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
            <span>AI 帮你找到问题出在哪</span>
            <span aria-hidden="true" className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
            <span>六维健康评分</span>
          </div>
        </div>
      </div>

      {/* ── 右栏：表单 ──────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-white dark:bg-gray-950">
        <div className="w-full max-w-md animate-page-in">
          {/* 小屏：顶部品牌条 */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/favicon-192.png" alt="" className="h-10 w-10 object-contain" />
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Nexora</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                One Core, All Commerce
              </p>
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
