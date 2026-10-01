import React, { useEffect, useRef, useState } from 'react';

/**
 * HealthRadarHero —— 首屏「开机序列」主角。
 *
 * 设计判断：原落地页有 6 层背景动效同时运行（极光 / 点阵 / 粒子 / 三层光斑 /
 * 玻璃光泽），而**真正要卖的产品界面是静止的**。注意力被发光的光斑抢走，
 * 产品反而成了配角 —— 这是首屏最大的错配。
 *
 * 这里把「六维经营健康雷达」做成主角：它是 Nexora 最差异化的资产，
 * 让产品能力本身成为动画，比任何装饰性粒子都更有说服力。
 *
 * 实现要点：
 *   · 纯 SVG，无第三方动画库
 *   · 单一 `started` 状态驱动，各元素用 CSS transition-delay 错开（避免多定时器）
 *   · `prefers-reduced-motion` 时直接呈现终态，动画不是内容的前提
 *   · 只动 transform / opacity / stroke-dashoffset，走合成层
 */

export interface RadarDimension {
  label: string;
  value: number; // 0-100
}

export interface HealthRadarHeroProps {
  dimensions?: RadarDimension[];
  score?: number;
  /** 入场序列开始前的延迟（毫秒） */
  startDelay?: number;
  className?: string;
}

const DEFAULT_DIMENSIONS: RadarDimension[] = [
  { label: '盈利', value: 82 },
  { label: '增长', value: 68 },
  { label: '库存', value: 74 },
  { label: '客户', value: 88 },
  { label: '履约', value: 79 },
  { label: '风险', value: 63 },
];

const SIZE = 220;
const CENTER = SIZE / 2;
const MAX_RADIUS = 74;
const RINGS = [0.25, 0.5, 0.75, 1];

/** 极坐标 → 直角坐标（0° 指向上方，顺时针六等分） */
function polar(radius: number, index: number, total: number): [number, number] {
  const angle = ((index * 360) / total - 90) * (Math.PI / 180);
  return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)];
}

function polygonPoints(values: number[], total: number, scale = 1): string {
  return values
    .map((v, i) => {
      const r = (MAX_RADIUS * Math.min(100, Math.max(0, v))) / 100 * scale;
      const [x, y] = polar(r, i, total);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/** 环形网格的顶点串 */
function ringPoints(total: number, ratio: number): string {
  return Array.from({ length: total }, (_, i) => {
    const [x, y] = polar(MAX_RADIUS * ratio, i, total);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

export const HealthRadarHero: React.FC<HealthRadarHeroProps> = ({
  dimensions = DEFAULT_DIMENSIONS,
  score = 84,
  startDelay = 250,
  className = '',
}) => {
  const total = dimensions.length;
  const [started, setStarted] = useState(false);
  const [displayScore, setDisplayScore] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    // 尊重系统「减少动态效果」：直接落到终态，动画只是修饰而非内容前提
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      setStarted(true);
      setDisplayScore(score);
      return;
    }

    const timer = window.setTimeout(() => setStarted(true), startDelay);
    return () => window.clearTimeout(timer);
  }, [startDelay, score]);

  // 分数滚动：起步快、末段缓（与雷达生长同步收尾）
  useEffect(() => {
    if (!started) return;
    const duration = 1400;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
      setDisplayScore(Math.round(score * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started, score]);

  const values = dimensions.map((d) => d.value);

  return (
    <div
      className={`relative rounded-[26px] border border-white/25 bg-white/70 backdrop-blur-xl p-6 shadow-[0_24px_70px_-20px_rgba(109,40,217,0.35)] ${className}`}
      style={{
        opacity: started ? 1 : 0,
        transform: started ? 'translateY(0) scale(1)' : 'translateY(26px) scale(0.97)',
        transition:
          'opacity 700ms cubic-bezier(0.22,1,0.36,1), transform 700ms cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] font-semibold tracking-wide text-[#6b7280]">
            经营健康引擎 · 实时体检
          </span>
        </div>
        <span className="text-[10px] text-[#9ca3af] tabular-nums">刚刚</span>
      </div>

      <div className="flex items-center gap-3">
        {/* ── 雷达图 ── */}
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-[184px] h-[184px] shrink-0 overflow-visible"
          role="img"
          aria-label={`六维经营健康雷达，综合 ${score} 分`}
        >
          <defs>
            <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.18" />
            </radialGradient>
            <filter id="radarGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 环形网格：逐圈绘制 */}
          {RINGS.map((ratio, i) => (
            <polygon
              key={ratio}
              points={ringPoints(total, ratio)}
              fill="none"
              stroke="#c4b5fd"
              strokeWidth="1"
              strokeOpacity={i === RINGS.length - 1 ? 0.85 : 0.42}
              style={{
                strokeDasharray: 600,
                strokeDashoffset: started ? 0 : 600,
                transition: `stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1) ${i * 110}ms`,
              }}
            />
          ))}

          {/* 轴线：从中心向外展开 */}
          {Array.from({ length: total }, (_, i) => {
            const [x, y] = polar(MAX_RADIUS, i, total);
            return (
              <line
                key={i}
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                stroke="#c4b5fd"
                strokeWidth="1"
                strokeOpacity="0.5"
                style={{
                  strokeDasharray: MAX_RADIUS,
                  strokeDashoffset: started ? 0 : MAX_RADIUS,
                  transition: `stroke-dashoffset 520ms cubic-bezier(0.22,1,0.36,1) ${180 + i * 60}ms`,
                }}
              />
            );
          })}

          {/* 数据多边形：从中心生长 */}
          <g
            style={{
              transformOrigin: `${CENTER}px ${CENTER}px`,
              transform: started ? 'scale(1)' : 'scale(0.04)',
              opacity: started ? 1 : 0,
              transition:
                'transform 1100ms cubic-bezier(0.34,1.42,0.64,1) 420ms, opacity 400ms ease-out 420ms',
            }}
          >
            <polygon
              points={polygonPoints(values, total)}
              fill="url(#radarFill)"
              stroke="#7c3aed"
              strokeWidth="2"
              strokeLinejoin="round"
              filter="url(#radarGlow)"
            />
          </g>

          {/* 数据点：依次点亮 */}
          {values.map((v, i) => {
            const [x, y] = polar((MAX_RADIUS * v) / 100, i, total);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="3.4"
                fill="#fff"
                stroke="#7c3aed"
                strokeWidth="2"
                style={{
                  opacity: started ? 1 : 0,
                  transform: started ? 'scale(1)' : 'scale(0)',
                  transformOrigin: `${x}px ${y}px`,
                  transition: `opacity 260ms ease-out ${900 + i * 90}ms, transform 420ms cubic-bezier(0.34,1.56,0.64,1) ${900 + i * 90}ms`,
                }}
              />
            );
          })}
        </svg>

        {/* ── 右侧：综合分 + 维度条 ── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1">
            <span
              className="text-[44px] leading-none font-bold tabular-nums bg-gradient-to-br from-violet-600 to-fuchsia-500 bg-clip-text text-transparent"
              style={{
                opacity: started ? 1 : 0,
                transform: started ? 'translateY(0)' : 'translateY(10px)',
                transition:
                  'opacity 520ms ease-out 700ms, transform 520ms cubic-bezier(0.34,1.4,0.64,1) 700ms',
              }}
            >
              {displayScore}
            </span>
            <span className="text-xs text-[#9ca3af] font-medium">/100</span>
          </div>
          <div className="text-[11px] text-[#6b7280] mb-3">综合健康分 · 良好</div>

          <div className="space-y-[6px]">
            {dimensions.map((d, i) => (
              <div key={d.label} className="flex items-center gap-2">
                <span className="text-[10px] w-6 text-[#9ca3af] shrink-0">{d.label}</span>
                <span className="relative h-[5px] flex-1 rounded-full bg-violet-100 overflow-hidden">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400"
                    style={{
                      width: started ? `${d.value}%` : '0%',
                      transition: `width 900ms cubic-bezier(0.22,1,0.36,1) ${1000 + i * 80}ms`,
                    }}
                  />
                </span>
                <span className="text-[10px] w-6 text-right tabular-nums text-[#6b7280]">
                  {d.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 底部洞察条：最后浮入 ── */}
      <div
        className="mt-3 flex items-start gap-2 rounded-xl bg-violet-50/80 border border-violet-100 px-3 py-2"
        style={{
          opacity: started ? 1 : 0,
          transform: started ? 'translateY(0)' : 'translateY(12px)',
          transition:
            'opacity 520ms ease-out 1500ms, transform 520ms cubic-bezier(0.34,1.4,0.64,1) 1500ms',
        }}
      >
        <span className="mt-[3px] w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
        <p className="text-[11px] leading-relaxed text-[#4b5563]">
          <span className="font-semibold text-violet-700">AI 建议：</span>
          库存周转 74 分拖累整体，A 类商品有 3 个 SKU 滞销超 45 天 —— 建议组合促销清库，预计释放 ¥12,600 现金流。
        </p>
      </div>
    </div>
  );
};

export default HealthRadarHero;
