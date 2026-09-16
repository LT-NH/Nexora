import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Check,
  Cpu,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';

/**
 * AI 模型切换器（超管专属）
 *
 * 背景：阿里百炼的免费额度**按模型分别计算**，一个模型的额度用完就得换下一个。
 * 这里提供运行时热切换：改完立即全进程生效（所有 AI 面板 + Agent 编排共用），
 * 不需要改 .env、不需要重启后端。
 *
 * 关键点：
 *   - 「设为当前」写库 + 刷进程内缓存 → 下一次 AI 调用即生效
 *   - 「自检」发一次最小真实请求，直接告诉你这个模型在你的 key/网关上能不能用
 *   - 额度状态由真实报错自动标记（未开通 / 额度耗尽 / 仅支持流式 …），不臆测
 */

interface Usage {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface ModelRow {
  id: string;
  model_id: string;
  label: string;
  note: string | null;
  family: string;
  family_label: string;
  is_custom: boolean;
  is_active: boolean;
  quota_status: string;
  quota_label: string;
  quota_message: string | null;
  quota_checked_at: string | null;
  last_used_at: string | null;
  activated_at: string | null;
  activated_by: string | null;
  usage: Usage;
}

interface RegistryResponse {
  active: string;
  active_source: string;
  key_configured: boolean;
  key_hint: string | null;
  base_url: string;
  usage_scope: string;
  models: ModelRow[];
}

interface TestResult {
  ok: boolean;
  model_id: string;
  latency_ms?: number;
  reply?: string;
  error?: string;
  quota_status?: string;
}

/** 状态 → 徽章配色（ok 绿 / 未开通·限流 琥珀 / 耗尽·Key 无效 红 / 未检测 灰） */
const STATUS_STYLE: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  unknown:
    'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  exhausted:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  unauthorized:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  error:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  throttled:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  denied:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  stream_only:
    'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
  not_found:
    'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
};

const fmtTokens = (n: number): string => {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

const fmtTime = (s: string | null): string => {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const AdminAIModels: React.FC = () => {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [newModel, setNewModel] = useState({ model_id: '', label: '', note: '' });
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const fetchModels = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res: any = await api.get('/admin/ai/models');
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || '加载模型注册表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const switchTo = async (model: ModelRow) => {
    if (model.is_active) return;
    setSwitching(model.model_id);
    try {
      const res: any = await api.post('/admin/ai/models/switch', {
        model_id: model.model_id,
      });
      addToast('success', res.data?.message || `已切换到 ${model.label}`);
      await fetchModels(true);
    } catch (e: any) {
      addToast('error', '切换失败', e?.response?.data?.detail || '');
    } finally {
      setSwitching(null);
    }
  };

  const testModel = async (model: ModelRow) => {
    setTesting(model.model_id);
    setTestResult(null);
    try {
      const res: any = await api.post('/admin/ai/models/test', {
        model_id: model.model_id,
      });
      const result: TestResult = res.data;
      setTestResult(result);
      if (result.ok) {
        addToast('success', `${model.label} 可用`, `真实延迟 ${result.latency_ms}ms`);
      } else {
        addToast('error', `${model.label} 不可用`, result.error?.slice(0, 120) || '');
      }
      await fetchModels(true);
    } catch (e: any) {
      addToast('error', '自检失败', e?.response?.data?.detail || '');
    } finally {
      setTesting(null);
    }
  };

  const addCustom = async () => {
    const mid = newModel.model_id.trim();
    if (!mid) {
      addToast('error', '请填写 model_id');
      return;
    }
    setSaving(true);
    try {
      await api.post('/admin/ai/models/custom', {
        model_id: mid,
        label: newModel.label.trim() || mid,
        note: newModel.note.trim() || null,
      });
      addToast('success', `已添加 ${mid}`);
      setNewModel({ model_id: '', label: '', note: '' });
      setShowCustom(false);
      await fetchModels(true);
    } catch (e: any) {
      addToast('error', '添加失败', e?.response?.data?.detail || '');
    } finally {
      setSaving(false);
    }
  };

  const removeCustom = async (model: ModelRow) => {
    try {
      await api.delete(`/admin/ai/models/custom/${model.model_id}`);
      addToast('success', `已删除 ${model.model_id}`);
      await fetchModels(true);
    } catch (e: any) {
      addToast('error', '删除失败', e?.response?.data?.detail || '');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-56 bg-gray-200 rounded shimmer" />
        <div className="h-40 bg-gray-100 rounded-2xl shimmer" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-36 bg-gray-100 rounded-2xl shimmer" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <h3 className="text-lg font-semibold text-[#111827] dark:text-gray-100">
          加载模型注册表失败
        </h3>
        <p className="text-sm text-gray-500 mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => fetchModels()}>
          重试
        </Button>
      </div>
    );
  }

  const active = data.models.find((m) => m.is_active);
  const families = Array.from(new Set(data.models.map((m) => m.family)));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 标题 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#111827] dark:text-gray-100">
            AI 模型切换
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            百炼免费额度按模型分别计算 —— 用完一个就地切换，改完立即生效，无需改 .env 或重启后端
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<RefreshCw size={14} />}
          onClick={() => fetchModels()}
          isLoading={loading}
        >
          刷新
        </Button>
      </div>

      {/* 当前生效模型 */}
      {active && (
        <div className="rounded-2xl border-2 border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 dark:from-violet-950/30 dark:via-gray-900 dark:to-gray-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-violet-600 dark:text-violet-300">
                <Zap size={13} />
                当前生效模型
              </div>
              <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                <span className="text-3xl font-extrabold tracking-tight text-[#111827] dark:text-white">
                  {active.label}
                </span>
                <code className="text-sm font-mono text-violet-700 dark:text-violet-300 bg-white/70 dark:bg-gray-800 px-2 py-0.5 rounded-md border border-violet-100 dark:border-violet-800">
                  {active.model_id}
                </code>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    STATUS_STYLE[active.quota_status] || STATUS_STYLE.unknown
                  }`}
                >
                  {active.quota_label}
                </span>
              </div>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 max-w-2xl">
                {active.note || '—'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span>
                  本次运行已调用 <b className="text-gray-700 dark:text-gray-200">{active.usage.calls}</b> 次
                </span>
                <span>
                  约 <b className="text-gray-700 dark:text-gray-200">{fmtTokens(active.usage.total_tokens)}</b> tokens
                </span>
                <span>切换时间 {fmtTime(active.activated_at)}</span>
                {active.activated_by && <span>操作人 {active.activated_by}</span>}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Activity size={14} />}
              onClick={() => testModel(active)}
              isLoading={testing === active.model_id}
            >
              自检
            </Button>
          </div>
        </div>
      )}

      {/* 凭证与端点信息 */}
      <Card title="凭证与端点" subtitle="平台级共享，租户不可见">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-sm">
          <div>
            <p className="text-xs text-gray-500">API Key</p>
            <p className="mt-1 font-mono text-gray-800 dark:text-gray-200">
              {data.key_configured ? data.key_hint : '未配置'}
            </p>
          </div>
          <div className="sm:col-span-2 min-w-0">
            <p className="text-xs text-gray-500">Base URL</p>
            <p className="mt-1 font-mono text-xs text-gray-800 dark:text-gray-200 break-all">
              {data.base_url}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          用量口径：{data.usage_scope}。各模型免费额度独立计算，具体以阿里百炼控制台为准。
          {data.active_source === 'env-fallback' && (
            <span className="text-amber-600 dark:text-amber-400">
              {' '}
              当前为 .env 回落值（注册表尚未装载）。
            </span>
          )}
        </p>
      </Card>

      {/* 自检结果 */}
      {testResult && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            testResult.ok
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
              : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold">
              {testResult.ok ? (
                <Check size={16} className="text-emerald-600" />
              ) : (
                <AlertTriangle size={16} className="text-red-600" />
              )}
              <code className="font-mono">{testResult.model_id}</code>
              <span className="font-normal text-gray-600 dark:text-gray-300">
                {testResult.ok
                  ? `可用 · 真实延迟 ${testResult.latency_ms}ms`
                  : `不可用 · 延迟 ${testResult.latency_ms ?? '—'}ms`}
              </span>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              关闭
            </button>
          </div>
          {testResult.ok ? (
            <p className="mt-2 text-gray-700 dark:text-gray-200">
              模型回复：<code className="font-mono">{testResult.reply || '(空)'}</code>
            </p>
          ) : (
            <p className="mt-2 font-mono text-xs text-red-700 dark:text-red-300 break-all">
              {testResult.error}
            </p>
          )}
        </div>
      )}

      {/* 模型列表（按系列分组） */}
      {families.map((family) => {
        const rows = data.models.filter((m) => m.family === family);
        return (
          <div key={family} className="space-y-3">
            <div className="flex items-center gap-2">
              <Cpu size={15} className="text-gray-400" />
              <h2 className="text-sm font-bold text-[#111827] dark:text-gray-100">
                {rows[0].family_label}
              </h2>
              <span className="text-xs text-gray-400">{rows.length} 个</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {rows.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    m.is_active
                      ? 'border-violet-300 bg-violet-50/50 dark:border-violet-700 dark:bg-violet-950/20'
                      : 'border-[#E4E6DC] dark:border-gray-700 bg-white dark:bg-gray-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 dark:text-gray-100">
                          {m.label}
                        </p>
                        {m.is_active && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-600 text-white">
                            使用中
                          </span>
                        )}
                        {m.is_custom && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            自定义
                          </span>
                        )}
                      </div>
                      <code className="mt-1 block text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
                        {m.model_id}
                      </code>
                    </div>
                    <span
                      className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                        STATUS_STYLE[m.quota_status] || STATUS_STYLE.unknown
                      }`}
                    >
                      {m.quota_label}
                    </span>
                  </div>

                  {m.note && (
                    <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {m.note}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400">
                    <span>{m.usage.calls} 次调用</span>
                    <span>{fmtTokens(m.usage.total_tokens)} tokens</span>
                    {m.quota_message && (
                      <button
                        onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                        className="text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        {expanded === m.id ? '收起报错' : '查看报错'}
                      </button>
                    )}
                  </div>

                  {expanded === m.id && m.quota_message && (
                    <pre className="mt-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 text-[11px] font-mono text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                      {m.quota_message}
                    </pre>
                  )}

                  <div className="mt-3 flex items-center gap-2">
                    {/*
                      注意：这里基座用 outline 而非默认 primary —— primary 的底色是
                      `background-image` 渐变，只写 !bg-[#EB9D2A] 会被渐变盖住（无效覆盖）。
                      outline 无渐变，important 覆盖才真正生效。
                    */}
                    <Button
                      size="sm"
                      variant="outline"
                      className={
                        m.is_active
                          ? ''
                          : '!border-[#EB9D2A] !text-[#EB9D2A] hover:!bg-[#EB9D2A] hover:!text-white hover:!border-[#EB9D2A]'
                      }
                      disabled={m.is_active}
                      isLoading={switching === m.model_id}
                      leftIcon={<ArrowRightLeft size={13} />}
                      onClick={() => switchTo(m)}
                    >
                      {m.is_active ? '当前使用中' : '设为当前'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Activity size={13} />}
                      isLoading={testing === m.model_id}
                      onClick={() => testModel(m)}
                    >
                      自检
                    </Button>
                    {m.is_custom && (
                      <button
                        onClick={() => removeCustom(m)}
                        title="删除自定义模型"
                        className="ml-auto p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* 自定义模型 */}
      <Card
        title="自定义模型"
        subtitle="百炼新上的模型，或目录里没有的 model_id，填进来即可参与切换"
      >
        {!showCustom ? (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => setShowCustom(true)}
            >
              添加模型
            </Button>
          </div>
        ) : (
          <div className="pt-2 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5 block">
                  model_id <span className="text-red-500">*</span>
                </label>
                <input
                  value={newModel.model_id}
                  onChange={(e) =>
                    setNewModel({ ...newModel, model_id: e.target.value })
                  }
                  placeholder="例如：qwen3-max"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#D6D9CD] bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#EB9D2A]/40 font-mono"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5 block">
                  显示名
                </label>
                <input
                  value={newModel.label}
                  onChange={(e) => setNewModel({ ...newModel, label: e.target.value })}
                  placeholder="留空则用 model_id"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#D6D9CD] bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#EB9D2A]/40"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1.5 block">
                备注
              </label>
              <input
                value={newModel.note}
                onChange={(e) => setNewModel({ ...newModel, note: e.target.value })}
                placeholder="例如：额度还剩多少 / 用途"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#D6D9CD] bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#EB9D2A]/40"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="!bg-[#EB9D2A] !border-[#EB9D2A] !text-white hover:!bg-[#d98d1f] hover:!border-[#d98d1f]"
                leftIcon={<Plus size={14} />}
                isLoading={saving}
                onClick={addCustom}
              >
                保存
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCustom(false);
                  setNewModel({ model_id: '', label: '', note: '' });
                }}
              >
                取消
              </Button>
              <p className="text-xs text-gray-400 ml-1">保存后建议先点「自检」确认可用</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
