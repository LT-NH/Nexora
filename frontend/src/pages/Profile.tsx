import React, { useState, useRef } from 'react';
import { User, Mail, Calendar, Save, Shield, Camera, Phone, FileText, Lock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { authService } from '@/services/auth';
import api from '@/services/api';

export const Profile: React.FC = () => {
  usePageTitle('个人资料');
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

  const handleSave = async () => {
    if (!user) return;
    if (!fullName.trim()) {
      addToast('warning', '请输入姓名', '姓名不能为空。');
      return;
    }
    setIsSaving(true);
    try {
      const response = await api.patch(`/auth/me`, { full_name: fullName, phone, bio });
      setUser(response.data);
      addToast('success', '资料已更新', '您的个人资料已保存。');
    } catch (err: any) {
      addToast('error', '保存失败', err?.response?.data?.detail || '发生错误');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      addToast('error', '格式不支持', '仅支持 PNG、JPEG、WebP 和 GIF 格式的图片。');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      addToast('error', '文件过大', '图片大小不能超过 2MB。');
      return;
    }

    setIsUploading(true);
    try {
      const updatedUser = await authService.uploadAvatar(file);
      setUser(updatedUser);
      addToast('success', '头像已更新', '您的头像已成功上传。');
    } catch (err: any) {
      addToast('error', '上传失败', err?.response?.data?.detail || '发生错误');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePasswordChange = async () => {
    if (!currentPassword.trim() || !newPassword.trim()) {
      addToast('warning', '请填写完整', '请填写当前密码和新密码。');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('error', '密码不匹配', '两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 8) {
      addToast('error', '密码太短', '至少8位字符');
      return;
    }
    setIsChangingPw(true);
    try {
      await api.patch('/auth/me/password', { current_password: currentPassword, new_password: newPassword });
      addToast('success', '密码已更新');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      addToast('error', '修改失败', err?.response?.data?.detail || '发生错误');
    } finally {
      setIsChangingPw(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">个人资料</h2>
        <p className="mt-1 text-sm text-gray-500">管理您的账户信息</p>
      </div>

      {/* 头像区域 */}
      <Card title="头像">
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
              aria-label="更换头像"
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
            <h3 className="text-lg font-semibold text-slate-900">{user.full_name}</h3>
            <p className="text-sm text-gray-500">{user.email}</p>
            <p className="text-xs text-gray-500 mt-1">点击头像更换图片</p>
          </div>
        </div>
      </Card>

      {/* 基本信息 */}
      <Card title="基本信息">
        <div className="space-y-5">
          <Input
            label="姓名"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="您的姓名"
            leftIcon={<User size={18} />}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Mail size={14} className="inline mr-1.5" />
              邮箱地址
            </label>
            <p className="text-sm text-gray-500 pl-1">{user.email}</p>
          </div>

          <Input
            label="电话"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="您的电话号码"
            leftIcon={<Phone size={18} />}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <FileText size={14} className="inline mr-1.5" />
              简介
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="简单介绍一下自己..."
              rows={3}
              maxLength={500}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
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
              保存更改
            </Button>
          </div>
        </div>
      </Card>

      {/* 修改密码 */}
      <Card title="修改密码">
        <div className="space-y-4">
          <Input
            label="当前密码"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="输入当前密码"
            leftIcon={<Lock size={18} />}
          />
          <Input
            label="新密码"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="至少8位字符"
            leftIcon={<Lock size={18} />}
          />
          <Input
            label="确认新密码"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入新密码"
            leftIcon={<Lock size={18} />}
          />
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={handlePasswordChange}
              isLoading={isChangingPw}
            >
              修改密码
            </Button>
          </div>
        </div>
      </Card>

      {/* 账户信息 */}
      <Card title="账户信息">
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-gray-500" />
              <span className="text-sm text-gray-600">注册时间</span>
            </div>
            <span className="text-sm text-gray-900">
              {new Date(user.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-gray-500" />
              <span className="text-sm text-gray-600">账户状态</span>
            </div>
            <Badge variant={user.is_active ? 'green' : 'red'}>
              {user.is_active ? '活跃' : '已禁用'}
            </Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-gray-500" />
              <span className="text-sm text-gray-600">角色</span>
            </div>
            <Badge variant={user.is_superadmin ? 'red' : 'blue'}>
              {user.is_superadmin ? '超级管理员' : '用户'}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
};