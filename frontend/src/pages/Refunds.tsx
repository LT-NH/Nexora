import React, { useEffect, useState, useCallback } from 'react';
import { RotateCcw, Plus, Search, Check, XCircle, RefreshCw } from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/components/ui/Toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { refundService } from '@/services/ecommerce';
import type { Refund, RefundStatus, RefundStats } from '@/types/ecommerce';
import { extractErrorMessage } from '@/services/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePageT, type Lang } from '@/i18n';

type T = (key: string, fallback?: string) => string;

const D = {
  zh: {
    page_title: '退款售后',
    err_load_failed: '加载失败',
    warn_fill: '请填写完整',
    warn_order_amount_required: '订单号和金额不能为空',
    ok_submitted: '退款申请已提交',
    err_submit_failed: '提交失败',
    ok_approved: '已批准退款',
    ok_rejected: '已拒绝退款',
    err_op_failed: '操作失败',
    refunds_title: '退款售后',
    refunds_subtitle: '管理退款申请与售后处理',
    btn_new_refund: '新建退款',
    stat_pending: '待处理',
    stat_approved: '已批准',
    stat_total_refunded: '退款总额',
    stat_total: '退款总数',
    refresh: '刷新',
    col_order: '订单号',
    col_amount: '退款金额',
    col_reason: '原因',
    col_status: '状态',
    col_time: '时间',
    col_actions: '操作',
    empty_title: '暂无退款记录',
    empty_desc: '点击「新建退款」开始处理售后',
    btn_process: '处理',
    modal_create_title: '新建退款申请',
    label_order_id: '订单 ID',
    placeholder_order_id: '输入订单 ID',
    label_amount: '退款金额 (¥)',
    label_reason: '退款原因',
    label_detail: '详细说明',
    placeholder_detail: '请描述具体情况...',
    btn_submit: '提交申请',
    modal_process_title: '处理退款',
    label_amount_short: '金额',
    btn_approve: '批准退款',
    btn_reject: '拒绝退款',
    label_note: '审核备注',
    placeholder_note: '输入审核意见...',
    tab_all: '全部',
    st_pending: '待处理',
    st_approved: '已批准',
    st_rejected: '已拒绝',
    st_processing: '处理中',
    st_completed: '已完成',
    reason_quality: '质量问题',
    reason_wrong_item: '发错货',
    reason_damaged: '商品损坏',
    reason_not_as_described: '与描述不符',
    reason_other: '其他',
  },
  en: {
    page_title: 'Refunds',
    err_load_failed: 'Load failed',
    warn_fill: 'Please complete the form',
    warn_order_amount_required: 'Order ID and amount are required',
    ok_submitted: 'Refund request submitted',
    err_submit_failed: 'Submit failed',
    ok_approved: 'Refund approved',
    ok_rejected: 'Refund rejected',
    err_op_failed: 'Operation failed',
    refunds_title: 'Refund Management',
    refunds_subtitle: 'Manage refund requests and after-sales handling',
    btn_new_refund: 'New refund',
    stat_pending: 'Pending',
    stat_approved: 'Approved',
    stat_total_refunded: 'Total refunded',
    stat_total: 'Total refunds',
    refresh: 'Refresh',
    col_order: 'Order',
    col_amount: 'Amount',
    col_reason: 'Reason',
    col_status: 'Status',
    col_time: 'Time',
    col_actions: 'Actions',
    empty_title: 'No refund records',
    empty_desc: 'Click "New refund" to start handling after-sales',
    btn_process: 'Process',
    modal_create_title: 'New refund request',
    label_order_id: 'Order ID',
    placeholder_order_id: 'Enter order ID',
    label_amount: 'Refund amount (¥)',
    label_reason: 'Refund reason',
    label_detail: 'Details',
    placeholder_detail: 'Describe the issue...',
    btn_submit: 'Submit request',
    modal_process_title: 'Process refund',
    label_amount_short: 'Amount',
    btn_approve: 'Approve refund',
    btn_reject: 'Reject refund',
    label_note: 'Reviewer note',
    placeholder_note: 'Enter review comment...',
    tab_all: 'All',
    st_pending: 'Pending',
    st_approved: 'Approved',
    st_rejected: 'Rejected',
    st_processing: 'Processing',
    st_completed: 'Completed',
    reason_quality: 'Quality issue',
    reason_wrong_item: 'Wrong item',
    reason_damaged: 'Damaged item',
    reason_not_as_described: 'Not as described',
    reason_other: 'Other',
  },
} as Record<Lang, Record<string, string>>;

const getStatusConfig = (t: T): Record<RefundStatus, { label: string; variant: 'warning' | 'success' | 'danger' | 'primary' | 'neutral' }> => ({
  pending: { label: t('st_pending'), variant: 'warning' },
  approved: { label: t('st_approved'), variant: 'success' },
  rejected: { label: t('st_rejected'), variant: 'danger' },
  processing: { label: t('st_processing'), variant: 'primary' },
  completed: { label: t('st_completed'), variant: 'success' },
});

const getReasonLabels = (t: T): Record<string, string> => ({
  quality: t('reason_quality'),
  wrong_item: t('reason_wrong_item'),
  damaged: t('reason_damaged'),
  not_as_described: t('reason_not_as_described'),
  other: t('reason_other'),
});

const getStatusTabs = (t: T): { key: string; label: string }[] => [
  { key: '', label: t('tab_all') },
  { key: 'pending', label: t('st_pending') },
  { key: 'approved', label: t('st_approved') },
  { key: 'completed', label: t('st_completed') },
];

export const Refunds: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('page_title'));
  const stCfg = getStatusConfig(t);
  const reasons = getReasonLabels(t);
  const tabs = getStatusTabs(t);

  const { currentWorkspace } = useWorkspace();
  const slug = currentWorkspace?.slug || '';
  const { addToast } = useToast();

  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [stats, setStats] = useState<RefundStats | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({ order_id: '', amount: 0, reason: 'other', reason_detail: '' });

  // Process form
  const [processAction, setProcessAction] = useState<'approved' | 'rejected'>('approved');
  const [reviewerNote, setReviewerNote] = useState('');

  const fetchRefunds = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const result = await refundService.getRefunds(slug, params);
      setRefunds(result);
    } catch (err) {
      addToast('error', t('err_load_failed'), extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [slug, statusFilter, addToast]);

  const fetchStats = useCallback(async () => {
    if (!slug) return;
    try {
      const s = await refundService.getRefundStats(slug);
      setStats(s);
    } catch (_) { /* non-critical */ }
  }, [slug]);

  useEffect(() => {
    fetchRefunds();
    fetchStats();
  }, [fetchRefunds, fetchStats]);

  const openCreateModal = () => {
    setCreateForm({ order_id: '', amount: 0, reason: 'other', reason_detail: '' });
    setShowCreateModal(true);
  };

  const handleCreate = async () => {
    if (!createForm.order_id || createForm.amount <= 0) {
      addToast('warning', t('warn_fill'), t('warn_order_amount_required'));
      return;
    }
    try {
      await refundService.createRefund(slug, createForm);
      addToast('success', t('ok_submitted'));
      setShowCreateModal(false);
      fetchRefunds(); fetchStats();
    } catch (err) {
      addToast('error', t('err_submit_failed'), extractErrorMessage(err));
    }
  };

  const openProcessModal = (refund: Refund) => {
    setSelectedRefund(refund);
    setProcessAction('approved');
    setReviewerNote('');
    setShowProcessModal(true);
  };

  const handleProcess = async () => {
    if (!selectedRefund) return;
    try {
      await refundService.processRefund(slug, selectedRefund.id, {
        status: processAction,
        reviewer_note: reviewerNote,
      });
      addToast('success', processAction === 'approved' ? t('ok_approved') : t('ok_rejected'));
      setShowProcessModal(false);
      fetchRefunds(); fetchStats();
    } catch (err) {
      addToast('error', t('err_op_failed'), extractErrorMessage(err));
    }
  };

  const formatPrice = (price: number) => `¥${price.toFixed(2)}`;
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-gray-100">{t('refunds_title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('refunds_subtitle')}</p>
        </div>
        <Button variant="primary" leftIcon={<Plus size={16} />} onClick={openCreateModal}>
          {t('btn_new_refund')}
        </Button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('stat_pending')}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.approved}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('stat_approved')}</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatPrice(stats.total_refunded)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('stat_total_refunded')}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-gray-600 dark:text-gray-400">{stats.total}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('stat_total')}</p>
          </div>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === tab.key
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button onClick={() => { fetchRefunds(); fetchStats(); }} className="ml-auto p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800" title={t('refresh')} aria-label={t('refresh')}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Refund list */}
      <Card>
        {loading ? (
          <div className="overflow-x-auto animate-fade-in">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_order')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_amount')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_reason')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_status')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_time')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-gray-800">
                    <td className="py-3 px-4"><div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></td>
                    <td className="py-3 px-4"><div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : refunds.length === 0 ? (
          <EmptyState
            icon={<RotateCcw size={40} />}
            title={t('empty_title')}
            description={t('empty_desc')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-left">
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_order')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_amount')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_reason')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_status')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_time')}</th>
                  <th className="py-3 px-4 font-medium text-gray-500">{t('col_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((refund) => {
                  const cfg = stCfg[refund.status] || { label: refund.status, variant: 'neutral' as const };
                  return (
                    <tr key={refund.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-3 px-4 font-mono text-xs">{refund.order_id?.slice(0, 8)}</td>
                      <td className="py-3 px-4 font-medium text-red-600 dark:text-red-400">{formatPrice(refund.amount)}</td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{reasons[refund.reason] || refund.reason}</td>
                      <td className="py-3 px-4"><Badge variant={cfg.variant}>{cfg.label}</Badge></td>
                      <td className="py-3 px-4 text-gray-400 text-xs">{formatDate(refund.created_at)}</td>
                      <td className="py-3 px-4">
                        {refund.status === 'pending' && (
                          <Button variant="outline" size="sm" onClick={() => openProcessModal(refund)}>{t('btn_process')}</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title={t('modal_create_title')}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('label_order_id')}</label>
            <input
              type="text"
              value={createForm.order_id}
              onChange={(e) => setCreateForm({ ...createForm, order_id: e.target.value })}
              placeholder={t('placeholder_order_id')}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('label_amount')}</label>
            <input
              type="number"
              value={createForm.amount || ''}
              onChange={(e) => setCreateForm({ ...createForm, amount: Number(e.target.value) })}
              placeholder="0.00"
              min="0" step="0.01"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('label_reason')}</label>
            <select
              value={createForm.reason}
              onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
            >
              {Object.entries(reasons).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('label_detail')}</label>
            <textarea
              value={createForm.reason_detail}
              onChange={(e) => setCreateForm({ ...createForm, reason_detail: e.target.value })}
              rows={3}
              placeholder={t('placeholder_detail')}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm resize-none"
            />
          </div>
        </div>
        <ModalFooter onCancel={() => setShowCreateModal(false)} onConfirm={handleCreate} confirmText={t('btn_submit')} />
      </Modal>

      {/* Process Modal */}
      <Modal isOpen={showProcessModal} onClose={() => setShowProcessModal(false)} title={t('modal_process_title')}>
        {selectedRefund && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">{t('col_order')}</span><span className="font-mono">{selectedRefund.order_id?.slice(0, 8)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t('label_amount_short')}</span><span className="text-red-600 font-medium">{formatPrice(selectedRefund.amount)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">{t('col_reason')}</span><span>{reasons[selectedRefund.reason] || selectedRefund.reason}</span></div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setProcessAction('approved')}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                  processAction === 'approved' ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                }`}
              >
                <Check size={16} className="inline mr-1" />{t('btn_approve')}
              </button>
              <button
                onClick={() => setProcessAction('rejected')}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                  processAction === 'rejected' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                }`}
              >
                <XCircle size={16} className="inline mr-1" />{t('btn_reject')}
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('label_note')}</label>
              <textarea
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
                rows={3}
                placeholder={t('placeholder_note')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm resize-none"
              />
            </div>
          </div>
        )}
        <ModalFooter
          onCancel={() => setShowProcessModal(false)}
          onConfirm={handleProcess}
          confirmText={processAction === 'approved' ? t('btn_approve') : t('btn_reject')}
          confirmVariant={processAction === 'approved' ? 'primary' : 'danger'}
        />
      </Modal>
    </div>
  );
};
