import React, { useState, useRef } from 'react';
import { User, Mail, Calendar, Save, Shield, Camera, Phone, FileText, Lock, Key, QrCode, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePageT, type Lang } from '@/i18n';
import { authService } from '@/services/auth';
import api from '@/services/api';

const D = {
  zh: {
    profile_page_title: '个人资料',
    setup_failed: '设置失败',
    error_occurred: '发生错误',
    enter_code: '请输入验证码',
    enter_code_msg: '请输入6位验证码。',
    twofa_enabled: '2FA已启用',
    twofa_enabled_msg: '双重认证已成功启用。',
    verify_failed: '验证失败',
    invalid_code: '验证码不正确',
    disabled: '已禁用',
    twofa_disabled_msg: '双重认证已禁用。',
    op_failed: '操作失败',
    enter_name: '请输入姓名',
    enter_name_msg: '姓名不能为空。',
    profile_updated: '资料已更新',
    profile_updated_msg: '您的个人资料已保存。',
    save_failed: '保存失败',
    format_unsupported: '格式不支持',
    format_unsupported_msg: '仅支持 PNG、JPEG、WebP 和 GIF 格式的图片。',
    file_too_large: '文件过大',
    file_too_large_msg: '图片大小不能超过 2MB。',
    avatar_updated: '头像已更新',
    avatar_updated_msg: '您的头像已成功上传。',
    upload_failed: '上传失败',
    fill_complete: '请填写完整',
    fill_complete_msg: '请填写当前密码和新密码。',
    password_mismatch: '密码不匹配',
    password_mismatch_msg: '两次输入的新密码不一致',
    password_too_short: '密码太短',
    password_too_short_msg: '至少8位字符',
    password_updated: '密码已更新',
    change_failed: '修改失败',
    avatar: '头像',
    basic_info: '基本信息',
    change_password: '修改密码',
    profile_title: '个人资料',
    profile_subtitle: '管理您的账户信息',
    change_avatar: '更换头像',
    click_avatar_hint: '点击头像更换图片',
    full_name: '姓名',
    full_name_placeholder: '您的姓名',
    email: '邮箱地址',
    phone: '电话',
    phone_placeholder: '您的电话号码',
    bio: '简介',
    bio_placeholder: '简单介绍一下自己...',
    save_changes: '保存更改',
    current_password: '当前密码',
    current_password_placeholder: '输入当前密码',
    new_password: '新密码',
    new_password_placeholder: '至少8位字符',
    confirm_password: '确认新密码',
    confirm_password_placeholder: '再次输入新密码',
    change_password_btn: '修改密码',
    two_factor: '双因素认证',
    twofa_desc: '启用双重认证为您的账户增添额外的安全保护。使用 Google Authenticator、Authy 或任何 TOTP 应用扫描二维码。',
    scan_hint: '请使用验证器应用扫描此二维码，然后输入生成的验证码。',
    totp_code: '验证码',
    verify: '验证',
    cancel_setup: '取消设置',
    enabled: '已启用',
    disable: '禁用',
    enable_2fa: '启用双因素认证',
    account_info: '账户信息',
    registered_at: '注册时间',
    account_status: '账户状态',
    active: '活跃',
    inactive: '已禁用',
    role: '角色',
    super_admin: '超级管理员',
    user: '用户',
  },
  en: {
    profile_page_title: 'Profile',
    setup_failed: 'Setup Failed',
    error_occurred: 'An error occurred',
    enter_code: 'Enter Verification Code',
    enter_code_msg: 'Please enter the 6-digit code.',
    twofa_enabled: '2FA Enabled',
    twofa_enabled_msg: 'Two-factor authentication has been enabled.',
    verify_failed: 'Verification Failed',
    invalid_code: 'Incorrect verification code',
    disabled: 'Disabled',
    twofa_disabled_msg: 'Two-factor authentication has been disabled.',
    op_failed: 'Operation Failed',
    enter_name: 'Enter Your Name',
    enter_name_msg: 'Name cannot be empty.',
    profile_updated: 'Profile Updated',
    profile_updated_msg: 'Your profile has been saved.',
    save_failed: 'Save Failed',
    format_unsupported: 'Format Not Supported',
    format_unsupported_msg: 'Only PNG, JPEG, WebP and GIF images are supported.',
    file_too_large: 'File Too Large',
    file_too_large_msg: 'Image size cannot exceed 2MB.',
    avatar_updated: 'Avatar Updated',
    avatar_updated_msg: 'Your avatar has been uploaded successfully.',
    upload_failed: 'Upload Failed',
    fill_complete: 'Fill in All Fields',
    fill_complete_msg: 'Please enter your current and new password.',
    password_mismatch: 'Passwords Do Not Match',
    password_mismatch_msg: 'The two new passwords do not match',
    password_too_short: 'Password Too Short',
    password_too_short_msg: 'At least 8 characters',
    password_updated: 'Password Updated',
    change_failed: 'Change Failed',
    avatar: 'Avatar',
    basic_info: 'Basic Info',
    change_password: 'Change Password',
    profile_title: 'Profile',
    profile_subtitle: 'Manage your account information',
    change_avatar: 'Change avatar',
    click_avatar_hint: 'Click the avatar to change the picture',
    full_name: 'Full Name',
    full_name_placeholder: 'Your full name',
    email: 'Email Address',
    phone: 'Phone',
    phone_placeholder: 'Your phone number',
    bio: 'Bio',
    bio_placeholder: 'Write a short introduction...',
    save_changes: 'Save Changes',
    current_password: 'Current Password',
    current_password_placeholder: 'Enter current password',
    new_password: 'New Password',
    new_password_placeholder: 'At least 8 characters',
    confirm_password: 'Confirm New Password',
    confirm_password_placeholder: 'Enter new password again',
    change_password_btn: 'Change Password',
    two_factor: 'Two-Factor Authentication',
    twofa_desc: 'Enable two-factor authentication to add extra security to your account. Scan the QR code with Google Authenticator, Authy or any TOTP app.',
    scan_hint: 'Scan this QR code with your authenticator app, then enter the generated code.',
    totp_code: 'Verification Code',
    verify: 'Verify',
    cancel_setup: 'Cancel Setup',
    enabled: 'Enabled',
    disable: 'Disable',
    enable_2fa: 'Enable 2FA',
    account_info: 'Account Info',
    registered_at: 'Registered At',
    account_status: 'Account Status',
    active: 'Active',
    inactive: 'Disabled',
    role: 'Role',
    super_admin: 'Super Admin',
    user: 'User',
  },
} as Record<Lang, Record<string, string>>;

export const Profile: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('profile_page_title'));
  const { user, setUser } = useAuth();
  const { addToast } = useToast();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPw, setIsChangingPw] = useState(false);

  // 2FA
  const [isSettingUp2FA, setIsSettingUp2FA] = useState(false);
  const [totpQrCode, setTotpQrCode] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  const [isDisabling2FA, setIsDisabling2FA] = useState(false);

  const handleSetup2FA = async () => {
    setIsSettingUp2FA(true);
    try {
      const response = await api.get('/auth/me/2fa/setup');
      setTotpQrCode(response.data.qr_code);
    } catch (err: any) {
      addToast('error', t('setup_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsSettingUp2FA(false);
    }
  };

  const handleVerify2FA = async () => {
    if (!totpCode.trim()) {
      addToast('warning', t('enter_code'), t('enter_code_msg'));
      return;
    }
    setIsVerifying2FA(true);
    try {
      await api.post('/auth/me/2fa/verify', { code: totpCode });
      addToast('success', t('twofa_enabled'), t('twofa_enabled_msg'));
      setTotpQrCode(null);
      setTotpCode('');
    } catch (err: any) {
      addToast('error', t('verify_failed'), err?.response?.data?.detail || t('invalid_code'));
    } finally {
      setIsVerifying2FA(false);
    }
  };

  const handleDisable2FA = async () => {
    setIsDisabling2FA(true);
    try {
      await api.post('/auth/me/2fa/disable');
      addToast('success', t('disabled'), t('twofa_disabled_msg'));
    } catch (err: any) {
      addToast('error', t('op_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsDisabling2FA(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!fullName.trim()) {
      addToast('warning', t('enter_name'), t('enter_name_msg'));
      return;
    }
    setIsSaving(true);
    try {
      const response = await api.patch(`/auth/me`, { full_name: fullName, phone, bio });
      setUser(response.data);
      addToast('success', t('profile_updated'), t('profile_updated_msg'));
    } catch (err: any) {
      addToast('error', t('save_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      addToast('error', t('format_unsupported'), t('format_unsupported_msg'));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      addToast('error', t('file_too_large'), t('file_too_large_msg'));
      return;
    }

    setIsUploading(true);
    try {
      const updatedUser = await authService.uploadAvatar(file);
      setUser(updatedUser);
      addToast('success', t('avatar_updated'), t('avatar_updated_msg'));
    } catch (err: any) {
      addToast('error', t('upload_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePasswordChange = async () => {
    if (!currentPassword.trim() || !newPassword.trim()) {
      addToast('warning', t('fill_complete'), t('fill_complete_msg'));
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('error', t('password_mismatch'), t('password_mismatch_msg'));
      return;
    }
    if (newPassword.length < 8) {
      addToast('error', t('password_too_short'), t('password_too_short_msg'));
      return;
    }
    setIsChangingPw(true);
    try {
      await api.patch('/auth/me/password', { current_password: currentPassword, new_password: newPassword });
      addToast('success', t('password_updated'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      addToast('error', t('change_failed'), err?.response?.data?.detail || t('error_occurred'));
    } finally {
      setIsChangingPw(false);
    }
  };

  if (!user) {
    return (
      <div className="space-y-6 max-w-2xl animate-fade-in">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-48" />
        </div>

        {/* 头像区域 skeleton */}
        <Card title={t('avatar')}>
          <div className="flex items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        </Card>

        {/* 基本信息 skeleton */}
        <Card title={t('basic_info')}>
          <div className="space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-24 w-full" />
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
        </Card>

        {/* 修改密码 skeleton */}
        <Card title={t('change_password')}>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-gray-100">{t('profile_title')}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('profile_subtitle')}</p>
      </div>

      {/* 头像区域 */}
      <Card title={t('avatar')}>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Avatar
              src={user.avatar_url}
              name={user.full_name}
              size="xl"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              aria-label={t('change_avatar')}
            >
              <Camera size={20} className="text-white" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{user.full_name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('click_avatar_hint')}</p>
          </div>
        </div>
      </Card>

      {/* 基本信息 */}
      <Card title={t('basic_info')}>
        <div className="space-y-5">
          <Input
            label={t('full_name')}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t('full_name_placeholder')}
            leftIcon={<User size={18} />}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Mail size={14} className="inline mr-1.5" />
              {t('email')}
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 pl-1">{user.email}</p>
          </div>

          <Input
            label={t('phone')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t('phone_placeholder')}
            leftIcon={<Phone size={18} />}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <FileText size={14} className="inline mr-1.5" />
              {t('bio')}
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('bio_placeholder')}
              rows={3}
              maxLength={500}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{bio.length}/500</p>
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

      {/* 修改密码 */}
      <Card title={t('change_password')}>
        <div className="space-y-4">
          <Input
            label={t('current_password')}
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={t('current_password_placeholder')}
            leftIcon={<Lock size={18} />}
          />
          <Input
            label={t('new_password')}
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('new_password_placeholder')}
            leftIcon={<Lock size={18} />}
          />
          <Input
            label={t('confirm_password')}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('confirm_password_placeholder')}
            leftIcon={<Lock size={18} />}
          />
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={handlePasswordChange}
              isLoading={isChangingPw}
            >
              {t('change_password_btn')}
            </Button>
          </div>
        </div>
      </Card>

      {/* 双因素认证 */}
      <Card title={t('two_factor')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('twofa_desc')}
          </p>

          {totpQrCode ? (
            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                <img src={totpQrCode} alt="2FA QR Code" className="w-48 h-48" />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                {t('scan_hint')}
              </p>
              <div className="flex items-center gap-3 w-full max-w-xs">
                <Input
                  label={t('totp_code')}
                  type="text"
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  maxLength={6}
                />
                <div className="pt-5">
                  <Button
                    variant="primary"
                    onClick={handleVerify2FA}
                    isLoading={isVerifying2FA}
                    size="sm"
                  >
                    {t('verify')}
                  </Button>
                </div>
              </div>
              <button
                onClick={() => setTotpQrCode(null)}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
              >
                <X size={14} />
                {t('cancel_setup')}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-gray-500 dark:text-gray-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('two_factor')}</span>
              </div>
              {user.totp_enabled ? (
                <div className="flex items-center gap-3">
                  <Badge variant="success">{t('enabled')}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisable2FA}
                    isLoading={isDisabling2FA}
                  >
                    {t('disable')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSetup2FA}
                  isLoading={isSettingUp2FA}
                  leftIcon={<QrCode size={16} />}
                >
                  {t('enable_2fa')}
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* 账户信息 */}
      <Card title={t('account_info')}>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-gray-500 dark:text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('registered_at')}</span>
            </div>
            <span className="text-sm text-gray-900">
              {new Date(user.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-gray-500 dark:text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('account_status')}</span>
            </div>
            <Badge variant={user.is_active ? 'success' : 'danger'}>
              {user.is_active ? t('active') : t('inactive')}
            </Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-gray-500 dark:text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('role')}</span>
            </div>
            <Badge variant={user.is_superadmin ? 'danger' : 'primary'}>
              {user.is_superadmin ? t('super_admin') : t('user')}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
};
