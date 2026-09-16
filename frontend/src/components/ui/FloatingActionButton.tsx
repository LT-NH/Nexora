import React from 'react';

/**
 * 右下角浮动按钮簇（Floating Action Cluster）统一规范
 *
 * 背景：这里曾经是三个各自为政的浮动按钮 —— 三种尺寸（56/48/44）、三种颜色
 * （紫色渐变 / blue-600 / 白底）、间距不等（24→96→176），而且「快速反馈」用的
 * blue-600 根本不是品牌色（品牌锚点是 #7c3aed）。视觉上就是"随手放的"。
 *
 * 另一个坑：`position: fixed` 的祖先若带 `transform`，fixed 会**相对该祖先**定位
 * 而不是视口（CSS 规范行为）—— AppLayout 的内容包裹层就有 transform，
 * 导致「快速反馈」的实际落点是视口偏上而不是右下角。
 * 所以这三个按钮必须挂在**同一个不带 transform 的层级**，且位置由本文件统一约束。
 */

/** 槽位：自下而上 24 / 84 / 144（48px 按钮 + 12px 均匀间隙） */
export type FabSlot = 'backToTop' | 'feedback' | 'ai';

/** 视觉层级：主行动（实心品牌渐变）> 次级（白底品牌色）> 工具（白底中性） */
export type FabVariant = 'primary' | 'brand' | 'neutral';

export const FAB_SIZE_PX = 48;
export const FAB_RIGHT_CLASS = 'right-6';

/** 改这里 = 三个按钮一起动，不会各自漂移 */
export const FAB_SLOT_CLASS: Record<FabSlot, string> = {
  backToTop: 'bottom-6', // 24px
  feedback: 'bottom-[84px]', // 24 + 48 + 12
  ai: 'bottom-[144px]', // 84 + 48 + 12
};

const VARIANT_CLASS: Record<FabVariant, string> = {
  // 主行动：品牌渐变实心
  primary:
    'bg-gradient-to-br from-primary-500 to-fuchsia-500 text-white shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/40',
  // 次级：白底 + 品牌色，hover 反色 —— 保持品牌一致但不与主行动抢
  brand:
    'bg-white text-primary-600 border border-primary-200 shadow-lg shadow-primary-500/10 hover:bg-primary-600 hover:text-white hover:border-primary-600 dark:bg-gray-800 dark:text-primary-300 dark:border-primary-800 dark:hover:bg-primary-600 dark:hover:text-white',
  // 工具级：白底中性
  neutral:
    'bg-white text-gray-500 border border-gray-200 shadow-lg hover:text-slate-900 hover:border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:text-white',
};

interface FloatingActionButtonProps {
  /** 槽位，决定纵向位置 */
  slot: FabSlot;
  variant: FabVariant;
  /** 无障碍名 + hover 气泡文案（同一个字符串，避免两处写岔） */
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** false → 淡出并让出点击（用于「返回顶部」的滚动条件显示） */
  visible?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  slot,
  variant,
  label,
  icon,
  onClick,
  visible = true,
  buttonRef,
}) => (
  <button
    ref={buttonRef}
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-hidden={visible ? undefined : true}
    tabIndex={visible ? 0 : -1}
    className={`
      group fixed ${FAB_RIGHT_CLASS} z-50 h-12 w-12 rounded-full
      flex items-center justify-center
      transition-all duration-300
      hover:scale-105 active:scale-95
      focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
      dark:focus-visible:ring-offset-gray-900
      ${FAB_SLOT_CLASS[slot]}
      ${VARIANT_CLASS[variant]}
      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}
    `}
  >
    {icon}
    {/* hover 气泡：让图标按钮自解释，而不是"一个孤零零的图标" */}
    <span
      role="tooltip"
      className="
        pointer-events-none absolute right-full mr-3 whitespace-nowrap
        rounded-lg bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium text-white
        opacity-0 translate-x-1 transition-all duration-200
        group-hover:opacity-100 group-hover:translate-x-0
        group-focus-visible:opacity-100
        dark:bg-gray-700
      "
    >
      {label}
    </span>
  </button>
);

export default FloatingActionButton;
