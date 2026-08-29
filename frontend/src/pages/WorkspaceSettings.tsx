import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Save,
  Trash2,
  Upload,
  AlertTriangle,
  Database,
  RefreshCw,
  Clock,
  Mail,
  Bell,
} from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useFormErrors } from '@/hooks/useForm';
import { workspaceService } from '@/services/workspace';
import api from '@/services/api';
import { useNavigate } from 'react-router-dom';
import { usePageT, type Lang } from '@/i18n';

const D = {
  zh: {
    page_title: '工作空间设置',
    general_settings: '通用设置',
    general_settings_subtitle: '更新工作空间详情',
    email_notifications: '邮件通知',
    notification_preferences: '配置通知偏好',
    data_backup: '数据备份',
    data_backup_subtitle: '手动备份或查看上次备份时间',
    workspace_name: '工作空间名称',
    workspace_name_placeholder: '我的工作空间',
    workspace_name_required: '工作空间名称不能为空',
    workspace_slug_label: '工作空间标识 (Slug)',
    slug_immutable: '工作空间标识创建后不可修改',
    logo_label: '图标',
    upload_logo: '上传图标',
    save_changes: '保存更改',
    brand_appearance: '品牌外观（白标）',
    brand_appearance_sub: '品牌名与主题色会实时应用到侧边栏品牌条与激活菜单',
    brand_name_label: '品牌名称',
    brand_name_placeholder: '例如：Nexora',
    brand_color_label: '品牌主题色',
    brand_dark_label: '默认深色模式',
    brand_preview_hint: '预览：下方为当前品牌色在侧边栏的呈现',
    brand_color_custom: '自定义颜色',
    new_order_notification: '新订单通知',
    low_stock_notification: '库存预警',
    payment_notification: '付款确认',
    send_test_email: '发送测试邮件',
    create_backup_title: '创建数据库备份',
    backup_schedule: '系统每天凌晨 3:00 自动备份，保留最近 7 个备份。',
    last_backup: '上次备份: {time}',
    backup_now: '立即备份',
    danger_zone: '危险区域',
    danger_zone_subtitle: '对工作空间的不可逆操作',
    demo_reset: '重置演示数据',
    demo_reset_subtitle: '一键恢复 90 天种子数据（商品 / 客户 / 订单 / 退款）',
    demo_reset_desc: '演示现场数据被修改或删除时，可一键清空并重新生成完整的 90 天演示数据，立即恢复到可演示状态。',
    demo_reset_btn: '立即重置',
    demo_reset_confirm_title: '确认重置演示数据？',
    demo_reset_confirm_desc: '将删除该工作空间全部订单、退款、商品与客户，并重新生成 90 天种子数据。此操作不可撤销。',
    demo_reset_confirm_btn: '确认重置',
    demo_reset_cancel_btn: '取消',
    demo_reset_success: '重置完成',
    demo_reset_success_msg: '演示数据已恢复为 90 天种子数据。',
    demo_reset_failed: '重置失败',
    delete_workspace_title: '删除此工作空间',
    delete_workspace_warning: '一旦删除工作空间，将无法恢复。所有数据、成员和 API 密钥将被永久删除。',
    delete_workspace: '删除工作空间',
    delete_confirm_warning: '此操作不可撤销。所有数据将被永久删除。',
    type_to_confirm_prefix: '请输入',
    type_to_confirm_suffix: '以确认。',
    error_occurred: '发生错误',
    backup_success: '备份完成',
    backup_success_msg: '数据库已成功备份。',
    backup_failed: '备份失败',
    file_too_large: '文件过大',
    file_too_large_msg: '图片大小不能超过 2MB。',
    logo_uploaded: '图标已上传',
    logo_uploaded_msg: '工作空间图标已更新。',
    upload_failed: '上传失败',
    settings_saved: '设置已保存',
    settings_saved_msg: '工作空间设置已更新。',
    save_failed: '保存失败',
    workspace_deleted: '工作空间已删除',
    workspace_deleted_msg: '该工作空间已被永久删除。',
    delete_failed: '删除失败',
    test_email_sent: '测试邮件已发送',
    test_email_sent_msg: '请检查您的收件箱。',
    send_failed: '发送失败',
  },
  en: {
    page_title: 'Workspace Settings',
    general_settings: 'General Settings',
    general_settings_subtitle: 'Update workspace details',
    email_notifications: 'Email Notifications',
    notification_preferences: 'Configure notification preferences',
    data_backup: 'Data Backup',
    data_backup_subtitle: 'Back up manually or check the last backup time',
    workspace_name: 'Workspace Name',
    workspace_name_placeholder: 'My workspace',
    workspace_name_required: 'Workspace name cannot be empty',
    workspace_slug_label: 'Workspace slug',
    slug_immutable: 'The workspace slug cannot be changed after creation',
    logo_label: 'Logo',
    upload_logo: 'Upload logo',
    save_changes: 'Save Changes',
    brand_appearance: 'Branding (White Label)',
    brand_appearance_sub: 'Brand name & color apply live to the sidebar accent bar and active menu',
    brand_name_label: 'Brand name',
    brand_name_placeholder: 'e.g. Nexora',
    brand_color_label: 'Brand color',
    brand_dark_label: 'Dark mode by default',
    brand_preview_hint: 'Preview: brand color as rendered in the sidebar',
    brand_color_custom: 'Custom color',
    new_order_notification: 'New order notifications',
    low_stock_notification: 'Low stock alerts',
    payment_notification: 'Payment confirmations',
    send_test_email: 'Send test email',
    create_backup_title: 'Create database backup',
    backup_schedule: 'The system backs up automatically every day at 3:00 AM, keeping the last 7 backups.',
    last_backup: 'Last backup: {time}',
    backup_now: 'Back up now',
    danger_zone: 'Danger Zone',
    danger_zone_subtitle: 'Irreversible actions for your workspace',
    demo_reset: 'Reset demo data',
    demo_reset_subtitle: 'One-click restore of 90-day seed data (products / customers / orders / refunds)',
    demo_reset_desc: 'If demo data was modified or deleted, reset it in one click to regenerate the full 90-day seed dataset.',
    demo_reset_btn: 'Reset now',
    demo_reset_confirm_title: 'Reset demo data?',
    demo_reset_confirm_desc: 'This will delete all orders, refunds, products and customers in this workspace and regenerate the 90-day seed data. This cannot be undone.',
    demo_reset_confirm_btn: 'Confirm reset',
    demo_reset_cancel_btn: 'Cancel',
    demo_reset_success: 'Reset complete',
    demo_reset_success_msg: 'Demo data has been restored to the 90-day seed dataset.',
    demo_reset_failed: 'Reset failed',
    delete_workspace_title: 'Delete this workspace',
    delete_workspace_warning: 'Once deleted, the workspace cannot be recovered. All data, members and API keys will be permanently deleted.',
    delete_workspace: 'Delete Workspace',
    delete_confirm_warning: 'This action cannot be undone. All data will be permanently deleted.',
    type_to_confirm_prefix: 'Type',
    type_to_confirm_suffix: 'to confirm.',
    error_occurred: 'An error occurred',
    backup_success: 'Backup complete',
    backup_success_msg: 'The database was backed up successfully.',
    backup_failed: 'Backup failed',
    file_too_large: 'File too large',
    file_too_large_msg: 'The image size must not exceed 2MB.',
    logo_uploaded: 'Logo uploaded',
    logo_uploaded_msg: 'The workspace logo has been updated.',
    upload_failed: 'Upload failed',
    settings_saved: 'Settings saved',
    settings_saved_msg: 'The workspace settings have been updated.',
    save_failed: 'Save failed',
    workspace_deleted: 'Workspace deleted',
    workspace_deleted_msg: 'The workspace has been permanently deleted.',
    delete_failed: 'Delete failed',
    test_email_sent: 'Test email sent',
    test_email_sent_msg: 'Please check your inbox.',
    send_failed: 'Send failed',
  },
} as Record<Lang, Record<string, string>>;

export const WorkspaceSettings: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('page_title'));
  const { currentWorkspace, setWorkspace, fetchWorkspaces, isLoading } = useWorkspace();
  const { user } = useAuth();
  const isSuperAdmin = user?.is_superadmin === true;
  const { addToast } = useToast();
  const { errors, setFieldError, clearErrors } = useFormErrors();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandName, setBrandName] = useState('');
  const [brandColor, setBrandColor] = useState('#7C3AED');
  const [brandDark, setBrandDark] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [notifyNewOrder, setNotifyNewOrder] = useState(true);
  const [notifyLowStock, setNotifyLowStock] = useState(true);
  const [notifyPayment, setNotifyPayment] = useState(true);
  const [isSendingTest, setIsSendingTest] = useState(false);

  useEffect(() => {
    if (currentWorkspace) {
      setName(currentWorkspace.name);
      setLogoUrl(currentWorkspace.logo_url);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const fetchBackupStatus = async () => {
      try {
        const resp = await api.get('/backup/status');
        setLastBackupTime(resp.data?.last_backup || null);
      } catch {}
    };
    fetchBackupStatus();
  }, [isSuperAdmin]);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const resp = await api.post('/backup');
      setLastBackupTime(resp.data?.last_backup || null);
      addToast('success', t('backup_success'), t('backup_success_msg'));
    } catch (err: any) {
      addToast('error', t('backup_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleResetDemo = async () => {
    setIsResetting(true);
    try {
      // 重置会重新生成 90 天种子数据（约 15-20 秒），单独放宽超时
      await api.post('/admin/reset-demo', {}, { timeout: 120000 });
      addToast('success', t('demo_reset_success'), t('demo_reset_success_msg'));
      setShowResetModal(false);
      await fetchWorkspaces();
    } catch (err: any) {
      addToast('error', t('demo_reset_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsResetting(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentWorkspace) return;
    
    if (file.size > 2 * 1024 * 1024) {
      addToast('error', t('file_too_large'), t('file_too_large_msg'));
      return;
    }
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post(
        `/workspaces/${currentWorkspace.slug}/upload-logo`,
        formData,
      );
      setLogoUrl(response.data.logo_url);
      addToast('success', t('logo_uploaded'), t('logo_uploaded_msg'));
    } catch (err: any) {
      addToast('error', t('upload_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!currentWorkspace) return;
    clearErrors();
    if (!name.trim()) {
      setFieldError('name', t('workspace_name_required'));
      return;
    }
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        logo_url: logoUrl,
        brand_color: brandColor,
        brand_dark_mode: brandDark,
      };
      // 品牌名为空时不提交（避免后端 min_length=1 校验 422）
      if (brandName.trim()) payload.brand_name = brandName.trim();
      const updated = await workspaceService.updateWorkspace(currentWorkspace.slug, payload as any);
      setWorkspace(updated);
      addToast('success', t('settings_saved'), t('settings_saved_msg'));
    } catch (err: any) {
      addToast('error', t('save_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentWorkspace || deleteConfirmName !== currentWorkspace.name) return;
    setIsDeleting(true);
    try {
      await workspaceService.deleteWorkspace(currentWorkspace.slug);
      addToast('success', t('workspace_deleted'), t('workspace_deleted_msg'));
      // Refresh workspaces list and navigate
      await fetchWorkspaces();
      navigate('/dashboard');
    } catch (err: any) {
      addToast('error', t('delete_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (isLoading && !currentWorkspace) {
    return (
      <div className="space-y-6 max-w-2xl animate-fade-in">
        {/* 通用设置 skeleton */}
        <Card title={t('general_settings')} subtitle={t('general_settings_subtitle')}>
          <div className="space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <div className="flex items-center gap-4">
                <Skeleton className="w-16 h-16 rounded-xl" />
                <Skeleton className="h-10 w-28" />
              </div>
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
        </Card>

        {/* 邮件通知 skeleton */}
        <Card title={t('email_notifications')} subtitle={t('notification_preferences')}>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-32" />
          </div>
        </Card>

        {/* 数据备份 skeleton（仅超管可见） */}
        {isSuperAdmin && (
          <Card title={t('data_backup')} subtitle={t('data_backup_subtitle')}>
            <Skeleton className="h-28 w-full" />
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <Card title={t('general_settings')} subtitle={t('general_settings_subtitle')}>
        <div className="space-y-5">
          <Input
            label={t('workspace_name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('workspace_name_placeholder')}
            error={errors.name}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('workspace_slug_label')}
            </label>
            <p className="text-sm text-gray-500">
              {currentWorkspace?.slug}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {t('slug_immutable')}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('logo_label')}
            </label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center transition-colors duration-200 hover:border-primary-300">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="w-full h-full rounded-xl object-cover"
                  />
                ) : (
                  <Building2 size={24} className="text-gray-500" />
                )}
              </div>
              <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <Button
                variant="outline"
                leftIcon={<Upload size={16} />}
                onClick={() => fileInputRef.current?.click()}
                isLoading={isUploading}
              >
                {t('upload_logo')}
              </Button>
            </>
            </div>
          </div>
          {/* 品牌外观（白标）——融合原品牌定制 */}
          <div className="pt-5 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-gray-100">{t('brand_appearance')}</h3>
            <p className="text-xs text-gray-500 mt-0.5 mb-4">{t('brand_appearance_sub')}</p>
            <div className="space-y-4">
              <Input
                label={t('brand_name_label')}
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder={t('brand_name_placeholder')}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('brand_color_label')}</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {['#7C3AED', '#0EA5E9', '#EC4899', '#F59E0B', '#10B981', '#111827'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBrandColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${brandColor === c ? 'border-slate-900 scale-110 dark:border-white' : 'border-transparent hover:scale-110'}`}
                      style={{ background: c }}
                      aria-label={c}
                    />
                  ))}
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-8 h-8 rounded-full border border-gray-300 cursor-pointer"
                    title={t('brand_color_custom')}
                  />
                  <span className="text-xs text-gray-400 font-mono">{brandColor}</span>
                </div>
                {/* 实时预览：品牌色条 */}
                <div className="mt-3">
                  <div className="h-2 w-24 rounded-full" style={{ background: brandColor }} />
                  <p className="text-[11px] text-gray-400 mt-1">{t('brand_preview_hint')}</p>
                </div>
              </div>
              <label className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 cursor-pointer">
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('brand_dark_label')}</span>
                <input
                  type="checkbox"
                  checked={brandDark}
                  onChange={(e) => setBrandDark(e.target.checked)}
                  className="w-4 h-4 accent-[#7C3AED]"
                />
              </label>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={handleSave}
              isLoading={isSaving}
              leftIcon={<Save size={16} />}
            >
              {t('save_changes')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Email Notifications */}
      <Card
        title={t('email_notifications')}
        subtitle={t('notification_preferences')}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-gray-500" />
              <span className="text-sm text-gray-700">{t('new_order_notification')}</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={notifyNewOrder}
                onChange={() => setNotifyNewOrder(!notifyNewOrder)}
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-gray-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">{t('low_stock_notification')}</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={notifyLowStock}
                onChange={() => setNotifyLowStock(!notifyLowStock)}
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-gray-500" />
              <span className="text-sm text-gray-700 dark:text-gray-300">{t('payment_notification')}</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={notifyPayment}
                onChange={() => setNotifyPayment(!notifyPayment)}
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Mail size={16} />}
              isLoading={isSendingTest}
              onClick={async () => {
                setIsSendingTest(true);
                try {
                  await api.post('/workspaces/test-email');
                  addToast('success', t('test_email_sent'), t('test_email_sent_msg'));
                } catch (err: any) {
                  addToast('error', t('send_failed'), err?.response?.data?.detail || t('error_occurred'));
                } finally {
                  setIsSendingTest(false);
                }
              }}
            >
              {t('send_test_email')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Data Backup（仅超管可见） */}
      {isSuperAdmin && (
      <Card
        title={t('data_backup')}
        subtitle={t('data_backup_subtitle')}
      >
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
          <div className="flex items-start gap-3">
            <Database size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                {t('create_backup_title')}
              </h4>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                {t('backup_schedule')}
              </p>
              {lastBackupTime && (
                <p className="text-xs text-blue-500 dark:text-blue-400 mt-2 flex items-center gap-1">
                  <Clock size={12} />
                  {t('last_backup').replace('{time}', new Date(lastBackupTime).toLocaleString('zh-CN'))}
                </p>
              )}
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                leftIcon={<RefreshCw size={16} />}
                isLoading={isBackingUp}
                onClick={handleBackup}
              >
                {t('backup_now')}
              </Button>
            </div>
          </div>
        </div>
      </Card>
      )}
      {/* Demo data reset（仅超管可见） */}
      {isSuperAdmin && (
      <Card title={t('demo_reset')} subtitle={t('demo_reset_subtitle')}>
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
          <div className="flex items-start gap-3">
            <RefreshCw size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-amber-800 dark:text-amber-300">{t('demo_reset_desc')}</p>
              <Button
                variant="danger"
                size="sm"
                className="mt-4"
                leftIcon={<RefreshCw size={16} />}
                isLoading={isResetting}
                onClick={() => setShowResetModal(true)}
              >
                {t('demo_reset_btn')}
              </Button>
            </div>
          </div>
        </div>
      </Card>
      )}

      {/* Demo reset confirmation modal */}
      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        title={t('demo_reset_confirm_title')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('demo_reset_confirm_desc')}</p>
        </div>
        <ModalFooter
          onCancel={() => setShowResetModal(false)}
          onConfirm={handleResetDemo}
          confirmText={t('demo_reset_confirm_btn')}
          cancelText={t('demo_reset_cancel_btn')}
          confirmVariant="danger"
          isLoading={isResetting}
        />
      </Modal>

      {/* Danger Zone */}
      <Card
        title={t('danger_zone')}
        subtitle={t('danger_zone_subtitle')}
        className="border-red-200"
      >
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-red-800">
                {t('delete_workspace_title')}
              </h4>
              <p className="text-sm text-red-600 mt-1">
                {t('delete_workspace_warning')}
              </p>
              <Button
                variant="danger"
                size="sm"
                className="mt-4"
                leftIcon={<Trash2 size={16} />}
                onClick={() => setShowDeleteModal(true)}
              >
                {t('delete_workspace')}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteConfirmName('');
        }}
        title={t('delete_workspace')}
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg border border-red-200 flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">
              {t('delete_confirm_warning')}
            </p>
          </div>
          <p className="text-sm text-gray-600">
            {t('type_to_confirm_prefix')}{' '}
            <span className="font-semibold text-slate-900">
              {currentWorkspace?.name}
            </span>{' '}
            {t('type_to_confirm_suffix')}
          </p>
          <Input
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder={currentWorkspace?.name}
          />
        </div>
        <ModalFooter
          onCancel={() => {
            setShowDeleteModal(false);
            setDeleteConfirmName('');
          }}
          onConfirm={handleDelete}
          confirmText={t('delete_workspace')}
          confirmVariant="danger"
          isLoading={isDeleting}
        />
      </Modal>
    </div>
  );
};
