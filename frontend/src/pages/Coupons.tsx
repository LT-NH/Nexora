import React, { useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  Ticket,
  Power,
  PowerOff,
  Calendar,
  Percent,
  DollarSign,
  Truck,
  Tag,
} from 'lucide-react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/components/ui/Toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { StatCard } from '@/components/ui/StatCard';
import { couponService } from '@/services/ecommerce';
import type { Coupon, CouponType } from '@/types/ecommerce';
import { usePageT, type Lang } from '@/i18n';

type T = (key: string, fallback?: string) => string;

const D = {
  zh: {
    page_title: '优惠券管理',
    err_load_failed: '加载优惠券失败',
    ok_created: '优惠券创建成功',
    err_create_failed: '创建失败',
    ok_status_updated: '状态已更新',
    err_op_failed: '操作失败',
    ok_deleted: '优惠券已删除',
    err_delete_failed: '删除失败',
    delete_confirm: '确定要删除该优惠券吗？',
    coupons_title: '优惠券管理',
    coupons_subtitle: '创建和管理优惠券，提升复购率',
    btn_create: '创建优惠券',
    stat_active: '活跃优惠券',
    stat_total: '优惠券总数',
    stat_redeemed: '已使用次数',
    empty_title: '还没有优惠券',
    empty_desc: '创建您的第一张优惠券，吸引更多顾客',
    col_code: '优惠码',
    col_type: '类型',
    col_value: '优惠力度',
    col_usage: '使用情况',
    col_validity: '有效期',
    col_status: '状态',
    col_actions: '操作',
    type_percent: '百分比折扣',
    type_fixed: '固定金额',
    type_free_shipping: '免运费',
    free_shipping_value: '免运费',
    min_order: '(满¥{amount})',
    st_expired: '已过期',
    st_active: '生效中',
    st_disabled: '已停用',
    title_deactivate: '停用',
    title_activate: '启用',
    aria_delete: '删除',
    modal_title: '创建优惠券',
    label_code: '优惠码',
    placeholder_code: '例如 SUMMER2026',
    label_type: '优惠类型',
    label_percent_value: '折扣百分比',
    label_fixed_value: '优惠金额 (¥)',
    label_free_shipping_value: '无需填写',
    label_min_order: '最低订单金额 (¥)',
    label_max_uses: '最大使用次数',
    label_expires: '过期时间',
    btn_confirm: '创建',
    btn_cancel: '取消',
  },
  en: {
    page_title: 'Coupons',
    err_load_failed: 'Failed to load coupons',
    ok_created: 'Coupon created',
    err_create_failed: 'Create failed',
    ok_status_updated: 'Status updated',
    err_op_failed: 'Operation failed',
    ok_deleted: 'Coupon deleted',
    err_delete_failed: 'Delete failed',
    delete_confirm: 'Delete this coupon?',
    coupons_title: 'Coupon Management',
    coupons_subtitle: 'Create and manage coupons to boost repeat purchases',
    btn_create: 'Create coupon',
    stat_active: 'Active coupons',
    stat_total: 'Total coupons',
    stat_redeemed: 'Times redeemed',
    empty_title: 'No coupons yet',
    empty_desc: 'Create your first coupon to attract more customers',
    col_code: 'Code',
    col_type: 'Type',
    col_value: 'Discount',
    col_usage: 'Usage',
    col_validity: 'Validity',
    col_status: 'Status',
    col_actions: 'Actions',
    type_percent: 'Percentage',
    type_fixed: 'Fixed amount',
    type_free_shipping: 'Free shipping',
    free_shipping_value: 'Free shipping',
    min_order: '(min order ¥{amount})',
    st_expired: 'Expired',
    st_active: 'Active',
    st_disabled: 'Disabled',
    title_deactivate: 'Deactivate',
    title_activate: 'Activate',
    aria_delete: 'Delete',
    modal_title: 'Create coupon',
    label_code: 'Code',
    placeholder_code: 'e.g. SUMMER2026',
    label_type: 'Coupon type',
    label_percent_value: 'Discount percentage',
    label_fixed_value: 'Discount amount (¥)',
    label_free_shipping_value: 'Not needed',
    label_min_order: 'Minimum order amount (¥)',
    label_max_uses: 'Max uses',
    label_expires: 'Expiry date',
    btn_confirm: 'Create',
    btn_cancel: 'Cancel',
  },
} as Record<Lang, Record<string, string>>;

const getTypeConfig = (t: T): Record<CouponType, { label: string; icon: React.ReactNode; color: string }> => ({
  percent: { label: t('type_percent'), icon: <Percent size={16} />, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  fixed: { label: t('type_fixed'), icon: <DollarSign size={16} />, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  free_shipping: { label: t('type_free_shipping'), icon: <Truck size={16} />, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
});

export const Coupons: React.FC = () => {
  const t = usePageT(D);
  usePageTitle(t('page_title'));
  const typeCfg = getTypeConfig(t);
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    type: 'percent' as CouponType,
    value: 10,
    min_order_amount: 0,
    max_uses: 100,
    expires_at: '',
  });

  const loadCoupons = React.useCallback(async () => {
    if (!currentWorkspace) return;
    setIsLoading(true);
    try {
      const data = await couponService.getCoupons(currentWorkspace.slug);
      setCoupons(data);
    } catch {
      addToast('error', t('err_load_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace, addToast]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const handleCreate = async () => {
    if (!currentWorkspace || !formData.code || !formData.expires_at) return;
    try {
      await couponService.createCoupon(currentWorkspace.slug, {
        code: formData.code,
        type: formData.type,
        value: formData.value,
        min_order_amount: formData.min_order_amount,
        max_uses: formData.max_uses,
        expires_at: new Date(formData.expires_at).toISOString(),
      });
      addToast('success', t('ok_created'));
      setShowModal(false);
      setFormData({ code: '', type: 'percent', value: 10, min_order_amount: 0, max_uses: 100, expires_at: '' });
      loadCoupons();
    } catch {
      addToast('error', t('err_create_failed'));
    }
  };

  const handleToggle = async (couponId: string) => {
    if (!currentWorkspace) return;
    try {
      await couponService.toggleCoupon(currentWorkspace.slug, couponId);
      addToast('success', t('ok_status_updated'));
      loadCoupons();
    } catch {
      addToast('error', t('err_op_failed'));
    }
  };

  const handleDelete = async (couponId: string) => {
    if (!currentWorkspace || !confirm(t('delete_confirm'))) return;
    try {
      await couponService.deleteCoupon(currentWorkspace.slug, couponId);
      addToast('success', t('ok_deleted'));
      loadCoupons();
    } catch {
      addToast('error', t('err_delete_failed'));
    }
  };

  const formatExpiry = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const isExpired = (dateStr: string) => new Date(dateStr) < new Date();

  const activeCoupons = coupons.filter((c) => c.is_active && !isExpired(c.expires_at));
  const totalRedeemed = coupons.reduce((sum, c) => sum + c.used_count, 0);

  if (!currentWorkspace) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-gray-100">{t('coupons_title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('coupons_subtitle')}</p>
        </div>
        <Button onClick={() => setShowModal(true)} leftIcon={<Plus size={16} />}>
          {t('btn_create')}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t('stat_active')} value={String(activeCoupons.length)} icon={<Ticket size={20} />} />
        <StatCard label={t('stat_total')} value={String(coupons.length)} icon={<Tag size={20} />} />
        <StatCard label={t('stat_redeemed')} value={String(totalRedeemed)} icon={<Ticket size={20} />} />
      </div>

      {/* Coupons Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : coupons.length === 0 ? (
        <EmptyState title={t('empty_title')} description={t('empty_desc')} icon={<Ticket size={32} />} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">{t('col_code')}</th>
                  <th className="px-4 py-3">{t('col_type')}</th>
                  <th className="px-4 py-3">{t('col_value')}</th>
                  <th className="px-4 py-3">{t('col_usage')}</th>
                  <th className="px-4 py-3">{t('col_validity')}</th>
                  <th className="px-4 py-3">{t('col_status')}</th>
                  <th className="px-4 py-3 text-right">{t('col_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {coupons.map((coupon) => {
                  const config = typeCfg[coupon.type] || typeCfg.percent;
                  const expired = isExpired(coupon.expires_at);
                  return (
                    <tr key={coupon.id} className="table-row hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-white">
                        {coupon.code}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
                          {config.icon}
                          {config.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {coupon.type === 'percent'
                          ? `${coupon.value}%`
                          : coupon.type === 'fixed'
                          ? `¥${coupon.value.toFixed(2)}`
                          : t('free_shipping_value')}
                        {coupon.min_order_amount > 0 && (
                          <span className="text-xs text-gray-400 ml-1">
                            {t('min_order').replace('{amount}', String(coupon.min_order_amount))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={coupon.used_count >= coupon.max_uses ? 'text-red-500' : ''}>
                          {coupon.used_count} / {coupon.max_uses}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex items-center gap-1 text-gray-500">
                          <Calendar size={12} />
                          {formatExpiry(coupon.starts_at)} - {formatExpiry(coupon.expires_at)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {expired ? (
                          <Badge variant="neutral">{t('st_expired')}</Badge>
                        ) : coupon.is_active ? (
                          <Badge variant="success">{t('st_active')}</Badge>
                        ) : (
                          <Badge variant="warning">{t('st_disabled')}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggle(coupon.id)}
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            title={coupon.is_active ? t('title_deactivate') : t('title_activate')}
                            aria-label={coupon.is_active ? t('title_deactivate') : t('title_activate')}
                          >
                            {coupon.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                          </button>
                          <button
                            onClick={() => handleDelete(coupon.id)}
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 hover:text-red-600"
                            title={t('aria_delete')}
                            aria-label={t('aria_delete')}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={t('modal_title')}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('label_code')}</label>
            <Input
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder={t('placeholder_code')}
            />
          </div>
          <div>
            <label htmlFor="coupon-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('label_type')}</label>
            <select
              id="coupon-type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as CouponType })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            >
              <option value="percent">{t('type_percent')}</option>
              <option value="fixed">{t('type_fixed')}</option>
              <option value="free_shipping">{t('type_free_shipping')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {formData.type === 'percent' ? t('label_percent_value') : formData.type === 'fixed' ? t('label_fixed_value') : t('label_free_shipping_value')}
            </label>
            {formData.type !== 'free_shipping' && (
              <Input
                type="number"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                min={1}
                max={formData.type === 'percent' ? 100 : undefined}
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('label_min_order')}</label>
            <Input
              type="number"
              value={formData.min_order_amount}
              onChange={(e) => setFormData({ ...formData, min_order_amount: Number(e.target.value) })}
              min={0}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('label_max_uses')}</label>
            <Input
              type="number"
              value={formData.max_uses}
              onChange={(e) => setFormData({ ...formData, max_uses: Number(e.target.value) })}
              min={1}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('label_expires')}</label>
            <Input
              type="datetime-local"
              value={formData.expires_at}
              onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
            />
          </div>
        </div>
        <ModalFooter
          onCancel={() => setShowModal(false)}
          onConfirm={handleCreate}
          confirmText={t('btn_confirm')}
          cancelText={t('btn_cancel')}
        />
      </Modal>
    </div>
  );
};
