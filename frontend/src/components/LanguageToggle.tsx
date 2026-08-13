import React, { useState, useEffect } from 'react';
import { getLang, setLang, type Lang } from '@/i18n';

/**
 * 语言切换器（中/EN pill toggle）。
 * 放在 Topbar 区域使用；Topbar 由中央合并方接入。
 */
export const LanguageToggle: React.FC = () => {
  const [lang, setLangState] = useState<Lang>(getLang);

  useEffect(() => {
    setLangState(getLang());
  }, []);

  const handleChange = (next: Lang) => {
    setLang(next);
    setLangState(next);
    // 触发全局语言变更通知（供订阅组件重渲染）
    window.dispatchEvent(new Event('nexora:langchange'));
  };

  return (
    <div
      className="inline-flex items-center rounded-full border border-gray-300 dark:border-gray-600 p-0.5 text-xs font-medium"
      role="group"
      aria-label="Language"
    >
      {(['zh', 'en'] as Lang[]).map((l) => {
        const active = lang === l;
        return (
          <button
            key={l}
            type="button"
            onClick={() => handleChange(l)}
            aria-pressed={active}
            className={`px-2.5 py-1 rounded-full transition-all duration-200 ${
              active
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {l === 'zh' ? '中' : 'EN'}
          </button>
        );
      })}
    </div>
  );
};

export default LanguageToggle;
