// ============================================================
// Nexora - 最小化 i18n 框架（中文 / English）
// 响应式：语言切换即时生效，无需刷新
// ============================================================

import { useSyncExternalStore } from 'react';

export const translations = {
  zh: {
    dashboard: '工作台',
    orders: '订单管理',
    products: '商品管理',
    customers: '客户管理',
    stores: '店铺管理',
    coupons: '优惠券',
    refunds: '退款售后',
    analytics: '数据分析',
    settings: '设置',
    profile: '个人资料',
    logout: '退出登录',
    ai_chat: 'AI 智能助手',
    payments: '收款管理',
    branding: '品牌定制',
    team: '团队',
    billing: '计费',
    api_keys: 'API 密钥',
    webhooks: 'Webhooks',
    permissions: '权限管理',
    theme_dark: '深色模式',
    theme_light: '浅色模式',
    theme_system: '跟随系统',
    open_sidebar: '打开侧边栏菜单',
    back_home: '回到产品主页',
    home: '首页',
    user: '用户',
    search: '搜索',
    search_placeholder: '搜索商品、订单、客户...',
    cancel: '取消',
    searching: '搜索中...',
    no_results: '无结果',
    search_hint: '输入关键词搜索',
    unknown_customer: '未知客户',
    notifications: '通知',
    mark_all_read: '全部已读',
    no_notifications: '暂无通知',
    ws_connected: '实时连接已建立',
    ws_polling: '实时连接未建立，使用轮询',
    ob_step1_title: '创建第一个商品',
    ob_step1_desc: '点击「商品」页面添加您的第一款商品，设置价格和库存',
    ob_step2_title: '导入订单数据',
    ob_step2_desc: '通过 CSV 批量导入或手动创建订单，开始管理您的业务',
    ob_step3_title: '查看数据分析',
    ob_step3_desc: '打开 Dashboard 查看营收趋势、AI 智能分析和运营建议',
    prev: '上一步',
    next: '下一步',
    start: '开始使用',
    skip: '跳过引导',
    feedback_thanks: '感谢您的反馈',
    feedback_fail: '提交失败，请稍后重试',
    submit_feedback: '提交反馈',
    satisfaction: '满意度评分',
    quick_feedback: '快速反馈',
    rate: '打分',
    rate_scale: '代表「非常不满意」，10 代表「非常满意」',
    ai_trend: '分析最近7天的销售趋势',
    ai_restock: '哪些商品需要补货',
    ai_copy: '生成一段营销文案',
    ai_rfm: '客户RFM分析报告',
    assistant: '助手',
    clear_chat: '清空记录',
    clear: '清空',

  },
  en: {
    dashboard: 'Dashboard',
    orders: 'Orders',
    products: 'Products',
    customers: 'Customers',
    stores: 'Stores',
    coupons: 'Coupons',
    refunds: 'Refunds',
    analytics: 'Analytics',
    settings: 'Settings',
    profile: 'Profile',
    logout: 'Log out',
    ai_chat: 'AI Assistant',
    payments: 'Payments',
    branding: 'Branding',
    team: 'Team',
    billing: 'Billing',
    api_keys: 'API Keys',
    webhooks: 'Webhooks',
    permissions: 'Permissions',    theme_dark: 'Dark mode',
    theme_light: 'Light mode',
    theme_system: 'System',
    open_sidebar: 'Open sidebar menu',
    back_home: 'Back to home',
    home: 'Home',
    user: 'User',
    search: 'Search',
    search_placeholder: 'Search products, orders, customers...',
    cancel: 'Cancel',
    searching: 'Searching...',
    no_results: 'No results',
    search_hint: 'Type to search',
    unknown_customer: 'Unknown customer',
    notifications: 'Notifications',
    mark_all_read: 'Mark all read',
    no_notifications: 'No notifications',
    ws_connected: 'Real-time connected',
    ws_polling: 'Polling (no live connection)',
    ob_step1_title: 'Create your first product',
    ob_step1_desc: 'Open Products to add your first item with price and stock',
    ob_step2_title: 'Import orders',
    ob_step2_desc: 'Import via CSV or create orders manually to start managing',
    ob_step3_title: 'Explore analytics',
    ob_step3_desc: 'Open Dashboard for revenue trends, AI insights and advice',
    prev: 'Back',
    next: 'Next',
    start: 'Get started',
    skip: 'Skip',
    feedback_thanks: 'Thanks for your feedback',
    feedback_fail: 'Submit failed, please retry',
    submit_feedback: 'Send feedback',
    satisfaction: 'Satisfaction',
    quick_feedback: 'Quick feedback',
    rate: 'Rate',
    rate_scale: '1 = very unsatisfied, 10 = very satisfied',
    ai_trend: 'Analyze last 7 days sales trend',
    ai_restock: 'Which products need restocking',
    ai_copy: 'Generate a marketing copy',
    ai_rfm: 'Customer RFM analysis',
    assistant: 'Assistant',
    clear_chat: 'Clear history',
    clear: 'Clear',

  },
};

export type Lang = 'zh' | 'en';
export type TranslationKey = keyof typeof translations.zh;

// ---- 响应式语言 store ----
let currentLang: Lang = 'zh';
try {
  const stored = localStorage.getItem('nexora_lang');
  if (stored === 'zh' || stored === 'en') currentLang = stored;
} catch {
  /* SSR / private mode: keep default */
}

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const getLang = (): Lang => currentLang;

export function setLang(l: Lang) {
  currentLang = l;
  try {
    localStorage.setItem('nexora_lang', l);
  } catch {}
  // 兼容旧订阅者（LanguageToggle 曾派发此事件）
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('nexora:langchange'));
  }
  notify();
}

export const t = (key: TranslationKey): string =>
  translations[currentLang][key] ?? translations.zh[key];

/** React hook：语言切换时触发组件重渲染，实现即时生效 */
export function useI18n(): { lang: Lang; t: typeof t } {
  const lang = useSyncExternalStore(subscribeLang, getLang);
  return { lang, t };
}

/** 页面级翻译 Hook：传入 { zh: {...}, en: {...} } 双语字典，
 *  返回 (key, fallback) => string 的翻译函数，语言切换时自动重渲染。 */
export function usePageT(dict: Record<Lang, Record<string, string>>) {
  const { lang } = useI18n();
  const d = dict[lang] ?? dict.zh;
  return (key: string, fallback?: string) => d[key] ?? fallback ?? key;
}
