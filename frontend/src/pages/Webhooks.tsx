import React, { useState, useEffect, useCallback } from 'react';
import {
  Webhook as WebhookIcon,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Send,
  RefreshCw,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageT, type Lang } from '@/i18n';
import api, { extractErrorMessage } from '@/services/api';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Webhook } from '@/types';

const AVAILABLE_EVENTS = [
  'all',
  'order.created',
  'order.updated',
  'order.status_updated',
];

const D = {
  zh: {
    event_all: '全部事件',
    event_order_created: '订单创建',
    event_order_updated: '订单更新',
    event_order_status_updated: '订单状态变更',
    name_url_required: '名称和 URL 为必填项',
    test_success: '测试发送成功！\n响应状态: {status}\n响应内容: {body}',
    test_failed: '测试失败: {msg}',
    select_workspace: '请先选择一个工作空间',
    webhooks_title: '出站 Webhooks',
    webhooks_subtitle: '配置 Webhook 将事件实时推送到您的服务器',
    new_webhook: '新建 Webhook',
    edit_webhook: '编辑 Webhook',
    name_label: '名称 *',
    name_placeholder: '例如：订单通知',
    url_label: 'URL *',
    events_label: '订阅事件',
    secret_label: 'HMAC 密钥 (可选)',
    secret_placeholder: '用于签名验证的共享密钥',
    secret_hint: '设置后将通过 X-Nexora-Signature 头传递 HMAC-SHA256 签名',
    enabled: '启用',
    saving: '保存中...',
    update: '更新',
    create: '创建',
    cancel: '取消',
    no_webhooks_title: '暂无出站 Webhook 配置',
    no_webhooks_desc: '创建一个 Webhook 将订单等事件实时推送到您的服务器',
    col_name: '名称',
    col_url: 'URL',
    col_events: '事件',
    col_status: '状态',
    col_last_triggered: '上次触发',
    col_actions: '操作',
    click_disable: '点击停用',
    click_enable: '点击启用',
    never_triggered: '从未触发',
    test_send: '测试发送',
    edit: '编辑',
    delete: '删除',
  },
  en: {
    event_all: 'All Events',
    event_order_created: 'Order Created',
    event_order_updated: 'Order Updated',
    event_order_status_updated: 'Order Status Updated',
    name_url_required: 'Name and URL are required',
    test_success: 'Test sent successfully!\nResponse status: {status}\nResponse body: {body}',
    test_failed: 'Test failed: {msg}',
    select_workspace: 'Please select a workspace first',
    webhooks_title: 'Outbound Webhooks',
    webhooks_subtitle: 'Configure webhooks to push events to your server in real time',
    new_webhook: 'New Webhook',
    edit_webhook: 'Edit Webhook',
    name_label: 'Name *',
    name_placeholder: 'e.g. Order Notifications',
    url_label: 'URL *',
    events_label: 'Subscribe to Events',
    secret_label: 'HMAC Secret (optional)',
    secret_placeholder: 'Shared secret used for signature verification',
    secret_hint: 'When set, an HMAC-SHA256 signature is sent via the X-Nexora-Signature header',
    enabled: 'Enabled',
    saving: 'Saving...',
    update: 'Update',
    create: 'Create',
    cancel: 'Cancel',
    no_webhooks_title: 'No outbound webhooks configured',
    no_webhooks_desc: 'Create a webhook to push events such as orders to your server in real time',
    col_name: 'Name',
    col_url: 'URL',
    col_events: 'Events',
    col_status: 'Status',
    col_last_triggered: 'Last Triggered',
    col_actions: 'Actions',
    click_disable: 'Click to disable',
    click_enable: 'Click to enable',
    never_triggered: 'Never triggered',
    test_send: 'Test Send',
    edit: 'Edit',
    delete: 'Delete',
  },
} as Record<Lang, Record<string, string>>;

const getEventLabel = (t: (key: string, fallback?: string) => string) => (event: string): string => {
  const map: Record<string, string> = {
    all: t('event_all'),
    'order.created': t('event_order_created'),
    'order.updated': t('event_order_updated'),
    'order.status_updated': t('event_order_status_updated'),
  };
  return map[event] || event;
};

export const Webhooks: React.FC = () => {
  const t = usePageT(D);
  const { currentWorkspace } = useWorkspace();
  const slug = currentWorkspace?.slug;

  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Webhook | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>(['order.created']);
  const [formSecret, setFormSecret] = useState('');
  const [formActive, setFormActive] = useState(true);

  const eventLabel = getEventLabel(t);

  const fetchWebhooks = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/workspaces/${slug}/webhooks`);
      setWebhooks(res.data || []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const resetForm = () => {
    setFormName('');
    setFormUrl('');
    setFormEvents(['order.created']);
    setFormSecret('');
    setFormActive(true);
    setEditing(null);
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setFormActive(true);
    setShowForm(true);
  };

  const openEdit = (wh: Webhook) => {
    setEditing(wh);
    setFormName(wh.name);
    setFormUrl(wh.url);
    setFormEvents(wh.events);
    setFormSecret(wh.secret || '');
    setFormActive(wh.is_active);
    setShowForm(true);
  };

  const toggleEvent = (event: string) => {
    setFormEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event]
    );
  };

  const handleSave = async () => {
    if (!slug) return;
    if (!formName.trim() || !formUrl.trim()) {
      setError(t('name_url_required'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: formName.trim(),
        url: formUrl.trim(),
        events: formEvents,
        secret: formSecret || undefined,
        is_active: formActive,
      };

      if (editing) {
        await api.patch(`/workspaces/${slug}/webhooks/${editing.id}`, payload);
      } else {
        await api.post(`/workspaces/${slug}/webhooks`, payload);
      }
      resetForm();
      await fetchWebhooks();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (wh: Webhook) => {
    if (!slug) return;
    try {
      await api.patch(`/workspaces/${slug}/webhooks/${wh.id}`, {
        is_active: !wh.is_active,
      });
      await fetchWebhooks();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleDelete = async (wh: Webhook) => {
    if (!slug) return;
    setDeleting(wh.id);
    try {
      await api.delete(`/workspaces/${slug}/webhooks/${wh.id}`);
      await fetchWebhooks();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDeleting(null);
    }
  };

  const handleTest = async (wh: Webhook) => {
    if (!slug) return;
    setTesting(wh.id);
    try {
      const res = await api.post(`/workspaces/${slug}/webhooks/${wh.id}/test`);
      alert(
        t('test_success')
          .replace('{status}', res.data.response_status)
          .replace('{body}', res.data.response_body)
      );
    } catch (err) {
      alert(t('test_failed').replace('{msg}', extractErrorMessage(err)));
    } finally {
      setTesting(null);
    }
  };

  if (!slug) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-500">{t('select_workspace')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100">
            {t('webhooks_title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('webhooks_subtitle')}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          {t('new_webhook')}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          <AlertTriangle size={16} />
          {error}
          <button onClick={() => setError('')} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
              {editing ? t('edit_webhook') : t('new_webhook')}
            </h3>
            <button
              onClick={resetForm}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('name_label')}
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('name_placeholder')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('url_label')}
              </label>
              <input
                type="url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://your-server.com/webhooks"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('events_label')}
            </label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_EVENTS.map((event) => (
                <button
                  key={event}
                  type="button"
                  onClick={() => toggleEvent(event)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    formEvents.includes(event)
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 border border-primary-300 dark:border-primary-700'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-600'
                  }`}
                >
                  {eventLabel(event)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('secret_label')}
            </label>
            <input
              type="text"
              value={formSecret}
              onChange={(e) => setFormSecret(e.target.value)}
              placeholder={t('secret_placeholder')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('secret_hint')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="webhook-active"
              checked={formActive}
              onChange={(e) => setFormActive(e.target.checked)}
              className="rounded"
            />
            <label
              htmlFor="webhook-active"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              {t('enabled')}
            </label>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {saving ? t('saving') : editing ? t('update') : t('create')}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Webhook List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={20} className="animate-spin text-gray-400" />
        </div>
      ) : webhooks.length === 0 ? (
        <EmptyState
          icon={<WebhookIcon size={40} />}
          title={t('no_webhooks_title')}
          description={t('no_webhooks_desc')}
          actionLabel={t('new_webhook')}
          onAction={openCreate}
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                  {t('col_name')}
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                  {t('col_url')}
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                  {t('col_events')}
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                  {t('col_status')}
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                  {t('col_last_triggered')}
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                  {t('col_actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((wh) => (
                <tr
                  key={wh.id}
                  className="table-row border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td className="px-4 py-3">
                    <span
                      className="text-sm font-medium text-slate-900 dark:text-gray-100 cursor-pointer hover:text-primary-600"
                      onClick={() => openEdit(wh)}
                    >
                      {wh.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-500 font-mono truncate block max-w-[200px]">
                      {wh.url}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {wh.events.slice(0, 3).map((e) => (
                        <span
                          key={e}
                          className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400"
                        >
                          {eventLabel(e)}
                        </span>
                      ))}
                      {wh.events.length > 3 && (
                        <span className="text-xs text-gray-400">
                          +{wh.events.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(wh)}
                      className="inline-flex"
                      title={wh.is_active ? t('click_disable') : t('click_enable')}
                      aria-label={wh.is_active ? t('click_disable') : t('click_enable')}
                    >
                      {wh.is_active ? (
                        <ToggleRight size={20} className="text-green-500" />
                      ) : (
                        <ToggleLeft size={20} className="text-gray-400" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs text-gray-400">
                      {wh.last_triggered_at
                        ? new Date(wh.last_triggered_at).toLocaleString('zh-CN')
                        : t('never_triggered')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleTest(wh)}
                        disabled={testing === wh.id}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-50"
                        title={t('test_send')}
                        aria-label={t('test_send')}
                      >
                        <Send size={14} className={testing === wh.id ? 'animate-pulse' : ''} />
                      </button>
                      <button
                        onClick={() => openEdit(wh)}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                        title={t('edit')}
                        aria-label={t('edit')}
                      >
                        <WebhookIcon size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(wh)}
                        disabled={deleting === wh.id}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 hover:text-red-600 disabled:opacity-50"
                        title={t('delete')}
                        aria-label={t('delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Webhooks;
