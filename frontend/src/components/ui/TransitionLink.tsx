import React, { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { withViewTransition } from '@/lib/viewTransition';

/**
 * 带页面转场的 Link（落地页 ↔ 登录/注册 ↔ 后台 等跨壳跳转使用）。
 * 不支持 View Transitions 的浏览器退化为普通 Link。
 */
export const TransitionLink: React.FC<
  { to: string; children: React.ReactNode; className?: string } & Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    'href'
  >
> = ({ to, children, className, onClick, ...rest }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (location.pathname === to) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      withViewTransition(() => navigate(to), 'page');
    },
    [navigate, location.pathname, to, onClick],
  );

  return (
    <Link to={to} className={className} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
};
