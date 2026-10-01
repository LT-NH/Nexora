import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Sparkles,
  Target,
} from 'lucide-react';
import api, { extractErrorMessage } from '@/services/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useToast } from '@/components/ui/Toast';

/**
 * TopRecommendation —— 「今天最该做的一件事」（可翻看的卡片堆）。
 *
 * ## 为什么是「一叠卡」而不是「一条」
 *
 * 最初把所有建议平铺：实测单个工作空间堆到 61 条（同类问题 23 条），按时间排序，
 * 结果是 125 条建议里只有 5 条被执行 —— 用户「连看的欲望都没有」。
 *
 * 于是收敛成一条。但只给一条会走向另一个极端：**用户失去了「还有什么」的出口**。
 * 所以最终形态是**卡片堆**：默认停在影响力最高的那张，可以左右翻看其余几条，
 * 但任何时候屏幕上只有一张在说话。
 *
 * ## 交互
 *   · 左右箭头 / 键盘 ← → 翻页
 *   · 「N / M」显示在整叠里的位置
 *   · 背后露出两张，层数随剩余条数变化，翻页时被主卡带得轻抬一下
 *   · 翻页 = 旧卡反向滑出 + 新卡侧向落位（两层同时在演，见 index.css「卡片堆翻页」）
 *   · 「查看全部」滚到页面上的 AI 决策面板（那里是未收敛的完整列表）
 */

interface TopInsight {
  id: string;
  insight_type: string;
  title: string;
  detail: string | null;
  confidence: number | null;
  action_type: string;
  action_params: Record<string, unknown> | null;
}

interface TopInsightResponse {
  items: TopInsight[];
  /** 去重后的待办总数（列表被 limit 截断时 > items.length） */
  total_todos: number;
  /** 去重前的原始建议条数 */
  total_pending: number;
}

/** 动作类型 → 人话标签 */
const ACTION_LABEL: Record<string, string> = {
  restock: '补货',
  refund_check: '核查退款',
  clearance: '清理积压',
  retention: '召回客户',
  price_adjust: '调整定价',
  keep: '保持观察',
};

const FALLBACK_LABEL = '待处理';

/**
 * 在场层 / 离场层共用的底色 —— 与卡片 surface-2 的渐变逐档对齐。
 * 必须不透明：交叠瞬间两层若都透明，两段文字会互相透视糊成一片。
 */
const CARD_SURFACE = 'bg-gradient-to-b from-white to-[#fafafb] dark:from-[#161d2b] dark:to-[#121924]';

/**
 * 把长段落拆成「事实 / 动作 / 预期」。
 *
 * 后端生成的 detail 普遍用中文分号分隔这三段。整段倒出来是 100+ 字，
 * 没人会读完 —— 拆开之后每段都能一眼扫过。
 */
function splitDetail(detail: string | null): { fact: string; action: string; outcome: string } {
  const parts = (detail || '')
    .split('；')
    .map((s) => s.trim())
    .filter(Boolean);
  return { fact: parts[0] || '', action: parts[1] || '', outcome: parts[2] || '' };
}

/** 滚动到页面上未收敛的完整建议列表（AI 决策面板）。 */
function scrollToInsightList() {
  const attempt = (): boolean => {
    const target = document.getElementById('ai-decision-panel');
    if (!target) return false;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    return true;
  };

  if (!attempt()) {
    requestAnimationFrame(() => {
      if (!attempt()) requestAnimationFrame(() => attempt());
    });
    return;
  }

  /*
    落点校正：面板常常正处在「骨架屏 → 真实内容」的切换过程里，高度会增大
    数百像素，而滚动按发起时的位置算终点、不跟随布局变化（实测偏 600+px）。
    在几个时间点各对齐一次 —— 幂等，位置已对时不会产生位移。
    与 prefers-reduced-motion 无关：校正解决的是「位置不对」，不是「要不要动画」。
  */
  [300, 900, 1800].forEach((delay) => window.setTimeout(attempt, delay));
}

export const TopRecommendation: React.FC<{ onShowAll?: () => void }> = ({ onShowAll }) => {
  const { currentWorkspace } = useWorkspace();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const slug = currentWorkspace?.slug;

  const [idx, setIdx] = useState(0);
  /** 翻页方向：1 = 看下一条（新卡从右侧进），-1 = 看上一条（从左侧进） */
  const [dir, setDir] = useState<1 | -1>(1);
  /**
   * 正在离场的上一张卡。
   * 旧实现只给新卡挂 key（换 key = 卸载旧 DOM），于是「旧卡凭空消失 + 新卡滑入」
   * 是两段互不相干的画面，观感是刷新而不是翻页 —— 留一层让旧卡反向滑出去。
   */
  const [outgoing, setOutgoing] = useState<{ item: TopInsight; dir: 1 | -1 } | null>(null);
  /** peek 层是否已经历过首次渲染 —— 首屏不该播「翻页联动」 */
  const peekMotionArmed = useRef(false);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    peekMotionArmed.current = true;
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ai-insights', 'top', slug],
    queryFn: async () => {
      const res = await api.get<TopInsightResponse>(`/workspaces/${slug}/ai/insights/top`);
      return res.data;
    },
    enabled: !!slug,
  });

  const execute = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(
        `/workspaces/${slug}/ai/insights/${id}/execute`,
        {},
        { timeout: 60000 },
      );
      return res.data;
    },
    onSuccess: () => {
      addToast('success', '已执行', '结果会在下次体检中体现');
      // 执行后重新拉取，列表会变短；回到第一张避免索引越界
      setIdx(0);
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    },
    onError: (err) => {
      addToast('error', '执行失败', extractErrorMessage(err));
    },
  });

  const items = data?.items ?? [];
  const count = items.length;

  // 数据变短时把索引夹回有效范围（例如执行完一条后列表刷新）
  useEffect(() => {
    if (count > 0 && idx > count - 1) setIdx(count - 1);
  }, [count, idx]);

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      const clamped = Math.max(0, Math.min(count - 1, next));
      if (clamped === idx) return; // 已在边界，不重播动画
      const nextDir: 1 | -1 = clamped > idx ? 1 : -1;
      // 记下当前这张，让它在离场动画里继续存在
      setOutgoing({ item: items[Math.min(idx, count - 1)], dir: nextDir });
      setDir(nextDir);
      setIdx(clamped);
    },
    [count, idx, items],
  );

  /** 离场动画播完 → 卸掉旧卡（不卸掉它会一直盖在新卡上面） */
  const handleOutgoingEnd = useCallback((e: React.AnimationEvent<HTMLDivElement>) => {
    // 子元素动画会冒泡上来，只认离场层自身的动画
    if (e.target !== e.currentTarget) return;
    setOutgoing(null);
  }, []);

  // 兜底：标签页切到后台时 animationend 可能不派发，旧卡不能永久留在 DOM 里
  useEffect(() => {
    if (!outgoing) return;
    const timer = window.setTimeout(() => setOutgoing(null), 800);
    return () => window.clearTimeout(timer);
  }, [outgoing]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(idx - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(idx + 1);
      }
    },
    [go, idx],
  );

  if (isLoading) {
    return (
      <div className="surface-2 rounded-2xl p-6 h-[168px] animate-pulse" aria-busy="true">
        <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mt-4 h-6 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mt-3 h-4 w-1/2 rounded bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  // 拉取失败就整体不渲染 —— 这一块是「锦上添花」，不该因为它挂掉影响整个首屏
  if (isError || !data) return null;

  /*
    响应格式兜底：后端未升级时会返回旧契约（top / hidden_count，没有 items）。
    那种情况下 items 会是空数组，组件会误判成「今天没有需要处理的事」并展示
    一个**错误的**安心提示 —— 比不显示更糟（用户会以为真的没事）。
    宁可不渲染，等接口对齐。
  */
  if (!Array.isArray(data.items)) return null;

  // 没有待处理建议：明确说「没事要你做」，这也是一个有价值的状态
  if (count === 0) {
    return (
      <div className="surface-2 rounded-2xl p-6 flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <Sparkles size={18} />
        </span>
        <div>
          <p className="text-sm font-medium text-[#111827] dark:text-gray-100">今天没有需要你处理的事</p>
          <p className="text-xs text-[#6B7280] dark:text-gray-400 mt-0.5">
            经营指标都在正常区间，有新情况我会主动提醒你
          </p>
        </div>
      </div>
    );
  }

  const top = items[Math.min(idx, count - 1)];

  /**
   * 卡片正文（头部标签 + 标题 + 三段式详情）。在场卡与离场卡共用同一份渲染 ——
   * 版式必须逐像素一致，否则动画中间两张卡会「胖瘦跳变」。
   */
  const renderCardBody = (item: TopInsight) => {
    const { fact, action, outcome } = splitDetail(item.detail);
    const label = ACTION_LABEL[item.action_type] ?? FALLBACK_LABEL;
    return (
      <>
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-70" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-600" />
            </span>
            <span className="text-[11px] font-semibold tracking-wide text-violet-700 dark:text-violet-300">
              今天最该做的一件事
            </span>
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-800">
            {label}
          </span>
        </div>

        <div className="px-6 pt-3 pb-5 min-h-[140px]">
          <h3 className="text-[19px] font-semibold leading-snug text-[#111827] dark:text-gray-100">
            {item.title}
          </h3>

          {fact && (
            <div className="mt-3 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-[3px] text-amber-500 shrink-0" />
              <p className="text-[13px] leading-relaxed text-[#4B5563] dark:text-gray-300">{fact}</p>
            </div>
          )}
          {action && (
            <div className="mt-2 flex items-start gap-2">
              <Target size={14} className="mt-[3px] text-violet-500 shrink-0" />
              <p className="text-[13px] leading-relaxed text-[#4B5563] dark:text-gray-300">{action}</p>
            </div>
          )}
          {outcome && (
            <div className="mt-2 flex items-start gap-2">
              <CircleDot size={14} className="mt-[3px] text-emerald-500 shrink-0" />
              <p className="text-[13px] leading-relaxed text-[#4B5563] dark:text-gray-300">{outcome}</p>
            </div>
          )}
        </div>
      </>
    );
  };

  // 当前卡之后还剩几张 —— 决定背后露出几层（最多 2 层，再多就糊成一片了）
  const remaining = count - idx - 1;
  const peekLayers = Math.min(remaining, 2);
  // 列表被 limit 截断时，还要告诉用户「后面还有更多」
  const truncated = Math.max(0, (data.total_todos ?? count) - count);
  // 背后两层的翻页联动：方向跟随翻页；首屏不播（一进页面虚卡先抖一下很怪）
  const peekNudge = !peekMotionArmed.current
    ? ''
    : dir === 1
      ? 'animate-peek-nudge-left'
      : 'animate-peek-nudge-right';

  return (
    <section className="relative pt-5" aria-label="今天最该做的一件事">
      {/*
        背后的卡片：层数随剩余条数变化 —— 翻到最后一张时不再假装还有一叠。
        用透明度 + 位移过渡（而不是条件渲染），这样层数变化时是「收起来」而非
        「瞬间消失」；配合翻页动画一起看才连贯。

        配色要点：一开始用近白渐变和 gray-200 都看不见（与页面底亮度差只有百分之几），
        必须用有明确梯度的中性色，配合主卡投影才能形成可辨识的层次。
      */}
      <div
        aria-hidden="true"
        className={`absolute top-0 left-8 right-8 h-12 transition-all duration-base ease-smooth ${
          peekLayers >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
        }`}
      >
        {/* 显隐过渡在壳上、翻页联动在芯上：同一元素上 animation 的 transform 会压掉
            transition 的 translate，两者必须分层；芯按 idx 换 key 才会重播动画 */}
        <div
          key={`peek-far-${idx}`}
          style={{ animationDelay: '70ms' }}
          className={`h-full rounded-t-2xl border border-b-0 border-gray-300/70 bg-gray-300 dark:border-gray-600 dark:bg-gray-700 ${peekNudge}`}
        />
      </div>
      <div
        aria-hidden="true"
        className={`absolute top-[9px] left-4 right-4 h-12 transition-all duration-base ease-smooth ${
          peekLayers >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
        }`}
      >
        <div
          key={`peek-near-${idx}`}
          className={`h-full rounded-t-2xl border border-b-0 border-gray-200 bg-gray-200 dark:border-gray-600 dark:bg-gray-800 ${peekNudge}`}
        />
      </div>

      <div className="relative surface-2 grain rounded-2xl overflow-hidden shadow-xl shadow-black/[0.07] dark:shadow-black/40">
        {/*
          双卡叠加：「抽走一张 → 落位一张」得两张卡一起演。旧实现换掉 key 就卸 DOM，
          旧卡凭空消失、只剩新卡自己滑入 —— 观感是刷新而不是翻页。

          离场层压在上层（z-10）：进场层起手时有一块「还没进画面」的空白底，
          盖在旧卡上会先糊出个洞。两层都铺 CARD_SURFACE ——
          交叠瞬间必须不透明，否则两段文字互相透视。

          操作行留在动画之外 —— 按钮和计数器不该跟着晃。
          min-h 用来压住「不同建议长度不同 → 卡片高度突变」造成的抖动。
        */}
        <div className="relative">
          {outgoing && (
            <div
              key={`out-${outgoing.item.id}`}
              aria-hidden="true"
              onAnimationEnd={handleOutgoingEnd}
              className={`absolute inset-x-0 top-0 z-10 pointer-events-none ${CARD_SURFACE} ${
                outgoing.dir === 1 ? 'animate-card-out-left' : 'animate-card-out-right'
              }`}
            >
              {renderCardBody(outgoing.item)}
            </div>
          )}
          <div
            key={top.id}
            className={`relative ${CARD_SURFACE} ${
              dir === 1 ? 'animate-card-in-right' : 'animate-card-in-left'
            }`}
          >
            {renderCardBody(top)}
          </div>
        </div>

        {/* 操作行：执行 + 翻页 */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-4">
          <button
            type="button"
            disabled={execute.isPending}
            onClick={() => execute.mutate(top.id)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-fast ease-spring hover:shadow-lg hover:shadow-violet-500/25 active:scale-[0.97] disabled:opacity-60"
          >
            {execute.isPending ? '正在执行…' : '立即处理'}
            {!execute.isPending && <ArrowRight size={15} />}
          </button>

          {count > 1 && (
            <div
              ref={groupRef}
              role="group"
              aria-label="切换建议"
              tabIndex={0}
              onKeyDown={handleKeyDown}
              className="flex items-center gap-1 rounded-xl border border-gray-200 dark:border-gray-700 p-0.5 focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2"
            >
              <button
                type="button"
                aria-label="上一条建议"
                disabled={idx === 0}
                onClick={() => go(idx - 1)}
                className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 transition-colors duration-fast hover:bg-gray-100 hover:text-violet-600 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-gray-700"
              >
                <ChevronLeft size={16} />
              </button>
              {/* 换 key 重播 → 页码跟着翻页一起动，而不是生硬地跳字 */}
              <span
                key={`page-${idx}-${count}`}
                className="animate-count-in min-w-[3.5rem] text-center text-[12px] tabular-nums text-gray-500 dark:text-gray-400"
              >
                {idx + 1} / {count}
              </span>
              <button
                type="button"
                aria-label="下一条建议"
                disabled={idx >= count - 1}
                onClick={() => go(idx + 1)}
                className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 transition-colors duration-fast hover:bg-gray-100 hover:text-violet-600 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-gray-700"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-6 pb-4">
          <p className="text-[11px] text-[#9CA3AF] dark:text-gray-500">
            原始 {data.total_pending} 条建议已合并为 {data.total_todos} 个待办，按影响程度排序
          </p>
          <button
            type="button"
            onClick={() => {
              onShowAll?.();
              scrollToInsightList();
            }}
            className="group inline-flex items-center gap-1 text-[11px] font-medium text-[#6B7280] dark:text-gray-400 transition-colors duration-fast hover:text-violet-600 dark:hover:text-violet-400"
          >
            查看全部{truncated > 0 ? `（还有 ${truncated} 条）` : ''}
            <ChevronDown
              size={13}
              className="transition-transform duration-fast group-hover:translate-y-0.5"
            />
          </button>
        </div>
      </div>
    </section>
  );
};

export default TopRecommendation;
