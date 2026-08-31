import React, { useState, useEffect, useCallback } from 'react';
import { Megaphone, RefreshCw, Send, History } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';

interface Announcement {
  title: string;
  message: string;
  created_at: string | null;
  recipients: number;
}

export const AdminAnnouncements: React.FC = () => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/admin/announcements');
      setHistory(res.data?.items || []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const send = async () => {
    if (!title.trim() || !message.trim()) {
      addToast('error', '请填写标题与内容');
      return;
    }
    setSending(true);
    try {
      const res: any = await api.post('/admin/announcements', { title: title.trim(), message: message.trim() });
      addToast('success', `广播成功，已推送 ${res.data.recipients} 位成员`);
      setTitle('');
      setMessage('');
      fetchHistory();
    } catch (e: any) {
      try { addToast('error', '广播失败', e?.response?.data?.detail || ''); } catch { /* ignore */ }
    } finally {
      setSending(false);
    }
  };

  const fmt = (s: string | null) =>
    s ? new Date(s.replace('+00:00', 'Z')).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100">公告广播</h1>
          <p className="mt-1 text-sm text-gray-500">平台公告推送至所有工作空间成员的通知中心</p>
        </div>
        <Button variant="outline" size="sm" leftIcon={<RefreshCw size={14} />} onClick={fetchHistory} isLoading={loading}>
          刷新
        </Button>
      </div>

      <Card title="发布新公告" subtitle="广播后所有工作空间成员的通知中心都会收到">
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5 block">公告标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：9 月平台功能更新通知"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#D6D9CD] bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#EB9D2A]/40"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5 block">公告内容</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="向所有商户同步平台动态、维护通知或新功能上线说明..."
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#D6D9CD] bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#EB9D2A]/40 resize-none"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-400">操作将记录审计日志</p>
            <Button
              className="!bg-[#EB9D2A] hover:!bg-[#d98d1f] text-white"
              leftIcon={<Send size={14} />}
              onClick={send}
              isLoading={sending}
            >
              广播至全平台
            </Button>
          </div>
        </div>
      </Card>

      <Card title="最近广播" subtitle="按标题聚合的广播记录">
        <div className="space-y-3">
          {history.map((h, i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-xl border border-[#E4E6DC] dark:border-gray-700">
              <div className="w-9 h-9 rounded-lg bg-[#EB9D2A]/10 flex items-center justify-center text-[#EB9D2A] shrink-0 mt-0.5">
                <Megaphone size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-900 dark:text-gray-100">{h.title}</p>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20">
                    已推送 {h.recipients} 人
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500 whitespace-pre-wrap break-words">{h.message}</p>
                <p className="mt-2 text-xs text-gray-400 flex items-center gap-1">
                  <History size={11} /> {fmt(h.created_at)}
                </p>
              </div>
            </div>
          ))}
          {history.length === 0 && !loading && (
            <div className="py-10 text-center text-gray-400 flex flex-col items-center gap-2">
              <Megaphone size={28} className="text-gray-300" />
              还没有发布过公告
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
