import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Save,
  Trash2,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useFormErrors } from '@/hooks/useForm';
import { workspaceService } from '@/services/workspace';
import api from '@/services/api';
import { useNavigate } from 'react-router-dom';

export const WorkspaceSettings: React.FC = () => {
  usePageTitle('工作空间设置');
  const { currentWorkspace, setWorkspace, fetchWorkspaces } = useWorkspace();
  const { addToast } = useToast();
  const { errors, setFieldError, clearErrors } = useFormErrors();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (currentWorkspace) {
      setName(currentWorkspace.name);
      setLogoUrl(currentWorkspace.logo_url);
    }
  }, [currentWorkspace]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentWorkspace) return;
    
    if (file.size > 2 * 1024 * 1024) {
      addToast('error', '文件过大', '图片大小不能超过 2MB。');
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
      addToast('success', '图标已上传', '工作空间图标已更新。');
    } catch (err: any) {
      addToast('error', '上传失败', err?.response?.data?.detail || '发生错误');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!currentWorkspace) return;
    clearErrors();
    if (!name.trim()) {
      setFieldError('name', '工作空间名称不能为空');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await workspaceService.updateWorkspace(currentWorkspace.slug, {
        name,
        logo_url: logoUrl,
      });
      setWorkspace(updated);
      addToast('success', '设置已保存', '工作空间设置已更新。');
    } catch (err: any) {
      addToast('error', '保存失败', err?.response?.data?.detail || '发生错误');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentWorkspace || deleteConfirmName !== currentWorkspace.name) return;
    setIsDeleting(true);
    try {
      await workspaceService.deleteWorkspace(currentWorkspace.slug);
      addToast('success', '工作空间已删除', '该工作空间已被永久删除。');
      // Refresh workspaces list and navigate
      await fetchWorkspaces();
      navigate('/dashboard');
    } catch (err: any) {
      addToast('error', '删除失败', err?.response?.data?.detail || '发生错误');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <Card title="通用设置" subtitle="更新工作空间详情">
        <div className="space-y-5">
          <Input
            label="工作空间名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="我的工作空间"
            error={errors.name}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              工作空间标识 (Slug)
            </label>
            <p className="text-sm text-gray-500">
              {currentWorkspace?.slug}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              工作空间标识创建后不可修改
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              图标
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
                上传图标
              </Button>
            </>
            </div>
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

      {/* Danger Zone */}
      <Card
        title="危险区域"
        subtitle="对工作空间的不可逆操作"
        className="border-red-200"
      >
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-red-800">
                删除此工作空间
              </h4>
              <p className="text-sm text-red-600 mt-1">
                一旦删除工作空间，将无法恢复。所有数据、成员和 API 密钥将被永久删除。
              </p>
              <Button
                variant="danger"
                size="sm"
                className="mt-4"
                leftIcon={<Trash2 size={16} />}
                onClick={() => setShowDeleteModal(true)}
              >
                删除工作空间
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
        title="删除工作空间"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-lg border border-red-200 flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">
              此操作不可撤销。所有数据将被永久删除。
            </p>
          </div>
          <p className="text-sm text-gray-600">
            请输入{' '}
            <span className="font-semibold text-slate-900">
              {currentWorkspace?.name}
            </span>{' '}
            以确认。
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
          confirmText="删除工作空间"
          confirmVariant="danger"
          isLoading={isDeleting}
        />
      </Modal>
    </div>
  );
};
