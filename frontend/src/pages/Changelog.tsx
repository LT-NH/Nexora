import React from 'react';
import { ArrowLeft, GitCommit } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

const changelogData: ChangelogEntry[] = [
  {
    version: 'v2.0',
    date: '2026年7月',
    changes: [
      '新增 AI 数据洞察（5 个 AI 端点：销售分析、客户画像、营销文案、SEO 关键词、商品描述）',
      '新增暗色模式（亮色/暗色/跟随系统三态切换）+ WCAG 2.1 AA 无障碍',
      '新增 Glass 毛玻璃特效 + 科技点阵背景 + 渐变光球装饰',
      '新增开场品牌动画（Logo 弹性弹入 + NEXORA 逐字展开 + 主页交叉淡入）',
      '代码重构：Product 路由 796→317 行（瘦身 60%），Order 路由 611→162 行（瘦身 73%）',
    ],
  },
  {
    version: 'v1.1',
    date: '2026年6月',
    changes: [
      '新增 28 项 pytest-asyncio 集成测试，全量 10.2s 通过',
      '新增 Fernet AES-128 字段级加密（api_secret / access_token）',
      '新增 JWT 双 Token 认证 + API Key SHA-256 双认证体系',
      '新增多平台店铺接入（Shopify / 抖音 / 淘宝 / 京东 / Amazon / 沙盒）',
      '新增 Subscriptions 订阅管理 + Stripe 预备集成',
    ],
  },
  {
    version: 'v1.0',
    date: '2026年6月',
    changes: [
      '初始版本发布',
      '多租户工作空间 + OWNER/ADMIN/MEMBER/VIEWER 角色权限',
      '商品 CRUD（多规格变体 + 分类树 + AI 描述生成）',
      '订单管理（状态流 + 日期筛选 + 统计 + 7 天趋势）',
      '客户管理（标签 + RFM 五层分析）',
      'API 密钥管理（生成/撤销/过期检测）',
    ],
  },
];

const Changelog: React.FC = () => {
  usePageTitle('更新日志');
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
        <div className="max-w-3xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              更新日志
            </h1>
            <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
              Nexora 产品的版本更新记录与变更详情
            </p>
          </div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700" />

            <div className="space-y-10">
              {changelogData.map((entry, idx) => (
                <div key={entry.version} className="relative pl-12">
                  {/* Timeline dot */}
                  <div className="absolute left-0 top-1 w-10 h-10 rounded-full bg-white dark:bg-gray-900 border-2 border-primary-500 flex items-center justify-center z-10">
                    <GitCommit size={16} className="text-primary-600" />
                  </div>

                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
                    <div className="flex items-baseline gap-3 mb-4">
                      <span className="text-lg font-bold text-slate-900 dark:text-white">
                        {entry.version}
                      </span>
                      <span className="text-sm text-gray-400 dark:text-gray-500">
                        {entry.date}
                      </span>
                    </div>
                    <ul className="space-y-2.5">
                      {entry.changes.map((change, ci) => (
                        <li
                          key={ci}
                          className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed"
                        >
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                          {change}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
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

export default Changelog;
