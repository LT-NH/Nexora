import React, { useState, useEffect } from 'react';
import { Palette, Save, Eye } from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/components/ui/Toast';
import { usePageT, type Lang } from '@/i18n';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { workspaceService } from '@/services/workspace';
import { extractErrorMessage } from '@/services/api';

const D = {
  zh: {
    branding_page_title: '品牌定制',
    no_workspace: '无工作空间',
    select_workspace: '请先选择工作空间',
    saved: '品牌设置已保存',
    save_failed: '保存失败',
    error_occurred: '发生错误',
    branding_title: '品牌定制',
    branding_subtitle: '白标定制：自定义品牌名称、Logo、主题色与深色模式',
    save_settings: '保存设置',
    brand_info: '品牌信息',
    brand_info_subtitle: '这些设置将应用到整个工作空间界面',
    brand_name: '品牌名称',
    brand_name_placeholder: '例如：Nexora',
    logo_url: 'Logo URL',
    logo_preview_alt: '品牌 Logo 预览',
    logo_preview: 'Logo 预览',
    brand_color: '品牌主题色',
    select_brand_color: '选择品牌主题色',
    select_color: '选择颜色 {c}',
    dark_mode: '深色模式',
    dark_mode_hint: '默认开启，为品牌界面启用深色主题',
    live_preview: '实时预览',
    live_preview_subtitle: '按当前设置渲染的品牌效果',
    brand_name_fallback: '品牌名称',
    branding_preview: '品牌定制预览',
    dark_enabled: '深色模式已启用',
    light_mode: '浅色模式',
    css_note_before: '品牌色通过',
    css_note_after: '注入全局样式；深色模式控制',
    css_note_tail: 'class。',
  },
  en: {
    branding_page_title: 'Branding',
    no_workspace: 'No Workspace',
    select_workspace: 'Please select a workspace first',
    saved: 'Brand settings saved',
    save_failed: 'Save Failed',
    error_occurred: 'An error occurred',
    branding_title: 'Branding',
    branding_subtitle: 'White-label customization: brand name, logo, theme color and dark mode',
    save_settings: 'Save Settings',
    brand_info: 'Brand Info',
    brand_info_subtitle: 'These settings apply to the entire workspace interface',
    brand_name: 'Brand Name',
    brand_name_placeholder: 'e.g. Nexora',
    logo_url: 'Logo URL',
    logo_preview_alt: 'Brand logo preview',
    logo_preview: 'Logo preview',
    brand_color: 'Brand Color',
    select_brand_color: 'Select brand color',
    select_color: 'Select color {c}',
    dark_mode: 'Dark Mode',
    dark_mode_hint: 'Enabled by default to use the dark theme for the brand interface',
    live_preview: 'Live Preview',
    live_preview_subtitle: 'How the brand renders with the current settings',
    brand_name_fallback: 'Brand Name',
    branding_preview: 'Branding preview',
    dark_enabled: 'Dark mode enabled',
    light_mode: 'Light mode',
    css_note_before: 'Brand color is injected globally via',
    css_note_after: '; dark mode toggles the',
    css_note_tail: 'class.',
  },
} as Record<Lang, Record<string, string>>;

export const Branding: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('branding_page_title'));

  const { currentWorkspace, fetchWorkspaces } = useWorkspace();
  const { addToast } = useToast();

  const [brandName, setBrandName] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#0071E3');
  const [brandDarkMode, setBrandDarkMode] = useState(true);
  const [saving, setSaving] = useState(false);

  // Initialize form from the current workspace
  useEffect(() => {
    if (currentWorkspace) {
      setBrandName(currentWorkspace.brand_name ?? currentWorkspace.name ?? '');
      setBrandLogoUrl(currentWorkspace.brand_logo_url ?? '');
      setBrandColor(currentWorkspace.brand_color || '#0071E3');
      setBrandDarkMode(currentWorkspace.brand_dark_mode ?? true);
    }
  }, [currentWorkspace]);

  const slug = currentWorkspace?.slug || '';

  const handleSave = async () => {
    if (!slug) {
      addToast('warning', t('no_workspace'), t('select_workspace'));
      return;
    }
    setSaving(true);
    try {
      await workspaceService.updateWorkspace(slug, {
        brand_name: brandName.trim() || null,
        brand_logo_url: brandLogoUrl.trim() || null,
        brand_color: brandColor,
        brand_dark_mode: brandDarkMode,
      });
      addToast('success', t('saved'));
      await fetchWorkspaces();
    } catch (err) {
      addToast('error', t('save_failed'), extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-gray-100">{t('branding_title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('branding_subtitle')}</p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Save size={16} />}
          onClick={handleSave}
          isLoading={saving}
        >
          {t('save_settings')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings form */}
        <Card title={t('brand_info')} subtitle={t('brand_info_subtitle')}>
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('brand_name')}
              </label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder={t('brand_name_placeholder')}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('logo_url')}
              </label>
              <input
                type="text"
                value={brandLogoUrl}
                onChange={(e) => setBrandLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
              {brandLogoUrl && (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <img
                    src={brandLogoUrl}
                    alt={t('logo_preview_alt')}
                    className="h-8 w-8 object-contain rounded-lg border border-gray-200 dark:border-gray-700 bg-white"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <span>{t('logo_preview')}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('brand_color')}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-10 w-14 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent"
                  aria-label={t('select_brand_color')}
                />
                <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
                  {brandColor.toUpperCase()}
                </span>
              </div>
              <div className="mt-3 flex gap-1.5">
                {['#0071E3', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#111827'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBrandColor(c)}
                    className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${
                      brandColor.toLowerCase() === c.toLowerCase()
                        ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900'
                        : ''
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={t('select_color').replace('{c}', c)}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('dark_mode')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('dark_mode_hint')}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={brandDarkMode}
                onClick={() => setBrandDarkMode(!brandDarkMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  brandDarkMode ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    brandDarkMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </Card>

        {/* Live preview */}
        <Card title={t('live_preview')} subtitle={t('live_preview_subtitle')}>
          <div
            className="relative overflow-hidden rounded-xl border border-black/10 dark:border-white/10 p-6"
            style={{ backgroundColor: brandColor }}
          >
            <div className="absolute inset-0 opacity-10 bg-tech-dots pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-3">
                {brandLogoUrl ? (
                  <img
                    src={brandLogoUrl}
                    alt=""
                    className="h-10 w-10 object-contain rounded-lg bg-white/90 p-0.5"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
                    <Palette size={20} className="text-white" />
                  </div>
                )}
                <div>
                  <p className="text-lg font-bold text-white">{brandName || t('brand_name_fallback')}</p>
                  <p className="text-xs text-white/70">{t('branding_preview')}</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg bg-white/15 backdrop-blur-sm p-3">
                    <div className="h-2 w-8 rounded bg-white/60 mb-2" />
                    <div className="h-2 w-12 rounded bg-white/40" />
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-2 text-sm text-white">
                <Eye size={16} />
                <span>{brandDarkMode ? t('dark_enabled') : t('light_mode')}</span>
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            {t('css_note_before')} <code className="font-mono">--brand-color</code> {t('css_note_after')}
            <code className="font-mono">.dark</code> {t('css_note_tail')}
          </p>
        </Card>
      </div>
    </div>
  );
};
