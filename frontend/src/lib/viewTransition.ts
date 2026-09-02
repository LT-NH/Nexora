import { flushSync } from 'react-dom';

type StartViewTransition = (cb: () => void) => { finished: Promise<void> };

/**
 * 全站页面转场：基于 View Transitions API（Chrome/Edge 111+/Safari 18+/新版 Firefox）。
 * 不支持的浏览器或用户开启 prefers-reduced-motion 时，优雅退化为直接切换。
 *
 * kind:
 *  - 'page'  落地页 ↔ 登录/注册 ↔ 后台 的跨壳切换（3D 透视 + 交叉淡化）
 *  - 'inner' 后台内部页面切换（仅内容区上滑淡入，侧边栏/顶栏保持不动）
 */
export function withViewTransition(update: () => void, kind: 'page' | 'inner' = 'page'): void {
  const doc = document as Document & { startViewTransition?: StartViewTransition };

  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (typeof doc.startViewTransition !== 'function' || reduced) {
    update();
    return;
  }

  routeProgress.start();
  const root = document.documentElement;
  root.dataset.vt = kind;

  try {
    const transition = doc.startViewTransition(() => {
      flushSync(update);
    });
    // 转场结束后清理标记与进度条
    void transition.finished.finally(() => {
      delete root.dataset.vt;
      routeProgress.done();
    });
  } catch {
    delete root.dataset.vt;
    routeProgress.done();
    update();
  }
}

/* ────────────────────────────────────────────────────────────
   主题切换涟漪：从点击位置圆形揭示新主题（View Transitions）
   ──────────────────────────────────────────────────────────── */
export function withThemeTransition(update: () => void, x: number, y: number): void {
  const doc = document as Document & { startViewTransition?: StartViewTransition };

  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (typeof doc.startViewTransition !== 'function' || reduced) {
    update();
    return;
  }

  const root = document.documentElement;
  root.style.setProperty('--tx', `${Math.round(x)}px`);
  root.style.setProperty('--ty', `${Math.round(y)}px`);
  // 精确半径：圆心到视口最远角的距离，保证揭示弧线自然铺满全屏
  const maxR = Math.max(
    Math.hypot(x, y),
    Math.hypot(window.innerWidth - x, y),
    Math.hypot(x, window.innerHeight - y),
    Math.hypot(window.innerWidth - x, window.innerHeight - y),
  );
  root.style.setProperty('--theme-reveal-r', `${Math.ceil(maxR + 24)}px`);
  root.dataset.vt = 'theme';

  try {
    const transition = doc.startViewTransition(() => {
      flushSync(update);
    });
    void transition.finished.finally(() => {
      delete root.dataset.vt;
    });
  } catch {
    delete root.dataset.vt;
    update();
  }
}

/* ────────────────────────────────────────────────────────────
   路由加载进度条（懒加载 chunk 期间显示，NProgress 风格细条）
   ──────────────────────────────────────────────────────────── */
type ProgressListener = (visible: boolean) => void;

const listeners = new Set<ProgressListener>();
let progressTimer: ReturnType<typeof setTimeout> | null = null;
let visibleState = false;

const emit = () => listeners.forEach((fn) => fn(visibleState));

export const routeProgress = {
  start() {
    visibleState = true;
    emit();
    if (progressTimer) clearTimeout(progressTimer);
    // 兜底：异常情况下 4s 后自动消失
    progressTimer = setTimeout(() => {
      visibleState = false;
      emit();
    }, 4000);
  },
  done() {
    if (progressTimer) {
      clearTimeout(progressTimer);
      progressTimer = null;
    }
    visibleState = false;
    emit();
  },
  subscribe(fn: ProgressListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  isVisible() {
    return visibleState;
  },
};
