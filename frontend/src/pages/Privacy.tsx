import React from 'react';
import { Link } from 'react-router-dom';

export const Privacy: React.FC = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="max-w-3xl mx-auto px-4 py-16">
      <Link to="/" className="text-primary-600 hover:text-primary-500 text-sm mb-8 inline-block">&larr; 返回首页</Link>
      <h1 className="text-3xl font-bold text-slate-900 mb-8">隐私政策</h1>
      <div className="prose prose-gray max-w-none space-y-6 text-gray-600">
        <p className="text-sm text-gray-500">最后更新：2026年7月12日</p>

        <h2 className="text-xl font-semibold text-slate-900 mt-8">1. 信息收集</h2>
        <p>我们收集您提供的信息，包括但不限于：姓名、电子邮件地址、账户信息和使用数据。我们使用这些信息来提供和改进我们的服务。</p>

        <h2 className="text-xl font-semibold text-slate-900 mt-8">2. 信息使用</h2>
        <p>我们使用收集的信息来：提供和维护服务、改进和个性化用户体验、与您沟通、确保安全和防止欺诈。</p>

        <h2 className="text-xl font-semibold text-slate-900 mt-8">3. 信息共享</h2>
        <p>我们不会出售您的个人信息。我们仅在以下情况下共享信息：经您同意、法律要求、保护权利和安全。</p>

        <h2 className="text-xl font-semibold text-slate-900 mt-8">4. 数据安全</h2>
        <p>我们采用行业标准的安全措施来保护您的个人信息。但请注意，没有任何互联网传输或电子存储方法是 100% 安全的。</p>

        <h2 className="text-xl font-semibold text-slate-900 mt-8">5. 数据保留</h2>
        <p>我们仅在为实现本隐私政策所述目的所必需的时间内保留您的个人信息。</p>

        <h2 className="text-xl font-semibold text-slate-900 mt-8">6. 您的权利</h2>
        <p>您有权访问、更正或删除您的个人信息。您可以通过账户设置或联系我们行使这些权利。</p>

        <h2 className="text-xl font-semibold text-slate-900 mt-8">7. Cookie</h2>
        <p>我们使用 Cookie 和类似技术来增强您的体验。您可以通过浏览器设置控制 Cookie 的使用。</p>

        <h2 className="text-xl font-semibold text-slate-900 mt-8">8. 联系我们</h2>
        <p>如果您对本隐私政策有任何疑问，请通过 privacy@saasforge.com 联系我们。</p>
      </div>
    </div>
  </div>
);