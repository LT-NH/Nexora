import React from 'react';
import { Link } from 'react-router-dom';

export const Terms: React.FC = () => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
    <div className="max-w-3xl mx-auto px-4 py-16">
      <Link to="/" className="text-primary-600 hover:text-primary-500 text-sm mb-8 inline-block">&larr; 返回首页</Link>
      <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-100 mb-8">服务条款</h1>
      <div className="prose prose-gray max-w-none space-y-6 text-gray-600 dark:text-gray-400">
        <p className="text-sm text-gray-500 dark:text-gray-400">最后更新：2026年7月12日</p>
        
        <h2 className="text-xl font-semibold text-slate-900 dark:text-gray-100 mt-8">1. 接受条款</h2>
        <p>使用 Nexora 平台即表示您同意本服务条款。如果您不同意这些条款，请勿使用我们的服务。</p>

        <h2 className="text-xl font-semibold text-slate-900 dark:text-gray-100 mt-8">2. 服务说明</h2>
        <p>Nexora 是一个多租户 SaaS 平台，提供工作空间管理、电商管理、团队协作等功能。我们保留随时修改或终止服务的权利。</p>

        <h2 className="text-xl font-semibold text-slate-900 dark:text-gray-100 mt-8">3. 用户账户</h2>
        <p>您有责任维护账户和密码的机密性。您同意对在您的账户下发生的所有活动负责。如发现任何未经授权使用您账户的情况，请立即通知我们。</p>

        <h2 className="text-xl font-semibold text-slate-900 dark:text-gray-100 mt-8">4. 订阅与付款</h2>
        <p>部分功能需要付费订阅。费用按所选方案和计费周期收取。所有费用均不可退还，除非法律另有规定。</p>

        <h2 className="text-xl font-semibold text-slate-900 dark:text-gray-100 mt-8">5. 数据与隐私</h2>
        <p>您保留对您数据的所有权。我们仅根据隐私政策使用您的数据来提供服务。我们采用行业标准的安全措施保护您的数据。</p>

        <h2 className="text-xl font-semibold text-slate-900 dark:text-gray-100 mt-8">6. 使用限制</h2>
        <p>您不得将服务用于任何非法目的或违反本条款的方式。您不得干扰或破坏服务或服务器。</p>

        <h2 className="text-xl font-semibold text-slate-900 dark:text-gray-100 mt-8">7. 免责声明</h2>
        <p>服务按"现状"提供，不提供任何明示或暗示的保证。我们不对服务的可用性、准确性或可靠性做出任何保证。</p>

        <h2 className="text-xl font-semibold text-slate-900 dark:text-gray-100 mt-8">8. 联系我们</h2>
        <p>如果您对本服务条款有任何疑问，请通过 support@nexora.app 联系我们。</p>
      </div>
    </div>
  </div>
);