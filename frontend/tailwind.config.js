/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',   // violet-500 — 主色，与图表配色一致
          600: '#7c3aed',   // violet-600 — 品牌锚点色
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        secondary: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
        success: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
        },
        warning: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
        },
        danger: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
          800: '#991B1B',
        },
      },
      fontFamily: {
        sans: [
          // 拉丁/数字：Plus Jakarta Sans（自托管变量字体，见 index.css @font-face）
          // 中文：按「观感最好 → 兜底」排序。**Noto Sans SC 必须排在 Microsoft YaHei 之前**
          // —— 实测（canvas 宽度法）本机装了思源黑体，但旧栈里雅黑优先，导致中文
          // 全部落到微软雅黑 14px，观感差且偏小。思源黑体笔画均匀、屏幕渲染干净。
          // 未装思源的机器会自然回退到雅黑，不会比现在更差；macOS 用苹方。
          'Plus Jakarta Sans',
          '-apple-system',
          'BlinkMacSystemFont',
          'PingFang SC',
          'MiSans',
          'HarmonyOS Sans SC',
          'Noto Sans SC',
          'Source Han Sans SC',
          'Microsoft YaHei',
          'system-ui',
          'sans-serif',
        ],
      },
      // 字号微调：正文/按钮/侧栏的主力档位是 text-sm(14px)，实测偏小。
      // 只放大「文字档位」，间距与宽度(w-/p-/gap- 是另一套 rem)不动，避免全局膨胀。
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.125rem' }], // 12px → 13px
        sm: ['0.9375rem', { lineHeight: '1.4rem' }],   // 14px → 15px
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out forwards',
        'slide-in-up': 'slideInUp 0.4s ease-out forwards',
        'float': 'float 3s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.8s ease-in-out infinite',
        'toast-in': 'toastIn 0.3s ease-out forwards',
        'toast-out': 'toastOut 0.3s ease-in forwards',
        'dropdown-in': 'dropdownIn 0.15s ease-out forwards',
        'badge-pulse': 'badgePulse 2s ease-in-out infinite',
        'grid-move': 'gridMove 20s linear infinite',
        'orb-float': 'orbFloat 8s ease-in-out infinite',
        'dot-pulse': 'dotPulse 2s ease-in-out infinite',
        'number-in': 'numberIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'border-spin': 'borderSpin 4s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95) translateY(4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        slideInUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(124, 58, 237, 0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(124, 58, 237, 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        toastIn: {
          '0%': { opacity: '0', transform: 'translateX(100%) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        toastOut: {
          '0%': { opacity: '1', transform: 'translateX(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateX(100%) scale(0.95)' },
        },
        dropdownIn: {
          '0%': { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        badgePulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.4)' },
          '50%': { boxShadow: '0 0 0 4px rgba(34, 197, 94, 0)' },
        },
        gridMove: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '60px 60px' },
        },
        orbFloat: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30px, -30px) scale(1.05)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.95)' },
        },
        dotPulse: {
          '0%, 100%': { boxShadow: '0 0 4px rgba(16, 185, 129, 0.4)' },
          '50%': { boxShadow: '0 0 16px rgba(16, 185, 129, 0.8)' },
        },
        numberIn: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        borderSpin: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
    },
  },
  plugins: [],
};