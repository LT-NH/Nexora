import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, RefreshCw, Star, ThumbsUp, Meh, ThumbsDown, CheckCheck, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';

interface FeedbackItem {
  id: string;
  type: string;
  nps_score: number | null;
  content: string | null;
  status: string;
  workspace_name: string;
  user_email: string;
  created_at: string | null;
}

interface FeedbackResp {
  items: FeedbackItem[];
  nps_stats: { total: number; promoters: number; passives: number; detractors: number; score: number };
}

export const AdminFeedback: React.FC = () => {
  const [data, setData] = useState<FeedbackResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'new' | 'resolved' | 'dismissed'>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/admin/feedback', { params: { limit: 200 } });
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const setStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/admin/feedback/${id}/status`, { status });
      fetchData();
    } catch { /* ignore */ }
  };

  const fmt = (s: string | null) =>
    s ? new Date(s.replace('+00:00', 'Z')).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  const nps = data?.nps_stats;
  const items = (data?.items ?? []).filter((f) => filter === 'all' || f.status === filter);

  const statusBadge = (s: string) =>
    s === 'resolved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20' :
    s === 'dismissed' ? 'bg-gray-100 text-gray-500 dark:bg-gray-700' :
    'bg-amber-50 text-amber-600 dark:bg-amber-900/20';

  const statusText = (s: string) => (s === 'resolved' ? '已处理' : s === 'dismissed' ? '已忽略' : '待处理');

  const npsCard = (icon: React.ReactNode, label: string, value: number, cls: string) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-[#E4E6DC] dark:border-gray-700 p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls}`}>{icon}</div>
      <div>
        <p className="text-lg font-extrabold tabular-nums text-slate-900 dark:text-gray-100">{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100">反馈中心</h1>
          <p className="mt-1 text-sm text-gray-500">全平台用户反馈与 NPS 评分 · 处理状态流转</p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<RefreshCw size={14} />} onClick={fetchData} isLoading={loading}>
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-[#E4E6DC] dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500">NPS 净推荐值</p>
          <p className={`mt-1.5 text-3xl font-extrabold tabular-nums ${(nps?.score ?? 0) >= 30 ? 'text-emerald-600' : (nps?.score ?? 0) >= 0 ? 'text-[#EB9D2A]' : 'text-red-600'}`}>
            {nps?.score ?? '—'}
          </p>
          <p className="mt-1 text-xs text-gray-400">共 {nps?.total ?? 0} 份评分</p>
        </div>
        {npsCard(<ThumbsUp size={16} className="text-emerald-600" />, '推荐者 9-10', nps?.promoters ?? 0, 'bg-emerald-50')}
        {npsCard(<Meh size={16} className="text-amber-600" />, '中立 7-8', nps?.passives ?? 0, 'bg-amber-50')}
        {npsCard(<ThumbsDown size={16} className="text-red-600" />, '贬损 0-6', nps?.detractors ?? 0, 'bg-red-50')}
        {npsCard(<MessageSquare size={16} className="text-[#0071E3]" />, '全部反馈', data?.items.length ?? 0, 'bg-blue-50')}
      </div>

      {/* 筛选 */}
      <div className="flex items-center gap-2">
        {(['all', 'new', 'resolved', 'dismissed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              filter === f
                ? 'bg-[#EB9D2A] text-white border-[#EB9D2A]'
                : 'bg-white dark:bg-gray-800 text-gray-500 border-[#E4E6DC] dark:border-gray-700 hover:border-[#EB9D2A]/50'
            }`}
          >
            {f === 'all' ? '全部' : f === 'new' ? '待处理' : f === 'resolved' ? '已处理' : '已忽略'}
          </button>
        ))}
      </div>

      <Card>
        <div className="space-y-3">
          {items.map((f) => (
            <div key={f.id} className="flex items-start gap-3 p-4 rounded-xl border border-[#E4E6DC] dark:border-gray-700 hover:bg-[#F7F8F2] dark:hover:bg-gray-800/40 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 dark:bg-violet-900/20">
                    {f.type === 'nps' ? 'NPS 评分' : '反馈'}
                  </span>
                  {f.type === 'nps' && f.nps_score !== null && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                      <Star size={11} fill="currentColor" /> {f.nps_score}
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(f.status)}`}>{statusText(f.status)}</span>
                  <span className="text-xs text-gray-400">{f.workspace_name}</span>
                </div>
                <p className="mt-2 text-sm text-slate-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                  {f.content || (f.type === 'nps' ? '（NPS 评分，无文字内容）' : '（空内容）')}
                </p>
                <p className="mt-2 text-xs text-gray-400">{f.user_email} · {fmt(f.created_at)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {f.status !== 'resolved' && (
                  <Button variant="ghost" size="sm" className="!text-emerald-600" leftIcon={<CheckCheck size={13} />} onClick={() => setStatus(f.id, 'resolved')}>
                    处理
                  </Button>
                )}
                {f.status !== 'dismissed' && (
                  <Button variant="ghost" size="sm" className="!text-gray-400" leftIcon={<X size={13} />} onClick={() => setStatus(f.id, 'dismissed')}>
                    忽略
                  </Button>
                )}
                {f.status !== 'new' && (
                  <Button variant="ghost" size="sm" onClick={() => setStatus(f.id, 'new')}>
                    重开
                  </Button>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="py-10 text-center text-gray-400 flex flex-col items-center gap-2">
              <MessageSquare size={28} className="text-gray-300" />
              暂无反馈
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
