import React, { createContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Workspace } from '@/types';
import { workspaceService } from '@/services/workspace';
import { useAuth } from '@/hooks/useAuth';

interface WorkspaceContextType {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean;
  setWorkspace: (workspace: Workspace) => void;
  fetchWorkspaces: () => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const currentWorkspaceRef = useRef(currentWorkspace);
  currentWorkspaceRef.current = currentWorkspace;

  const fetchWorkspaces = useCallback(async () => {
    // 未登录（登出后挂起的请求）不拉取、也不写缓存，
    // 避免登出后把旧账号的 workspace id 写回 localStorage（竞态残留）。
    if (!localStorage.getItem('access_token')) return;
    setIsLoading(true);
    try {
      const data = await workspaceService.getWorkspaces();
      setWorkspaces(data);
      // 归属校验（账号切换核心修复）：
      // 当前选中 / 本地缓存的 workspace 必须属于当前登录用户的列表。
      // 若不属于（例如切换账号后沿用旧账号的 workspace id），自动回退到第一个，
      // 保证「切换账号 → 工作空间自动跟随」，不再需要手动在左上角切换。
      const currentId =
        currentWorkspaceRef.current?.id ?? localStorage.getItem('current_workspace_id');
      const found = data.find((w) => w.id === currentId) ?? data[0] ?? null;
      setCurrentWorkspace(found);
      if (found) localStorage.setItem('current_workspace_id', found.id);
      else localStorage.removeItem('current_workspace_id');
    } catch (error) {
      // Silently handle error - the UI will show empty state
    } finally {
      setIsLoading(false);
    }
  }, []); // Do NOT depend on currentWorkspace to avoid infinite loop

  const setWorkspace = useCallback((workspace: Workspace) => {
    setCurrentWorkspace(workspace);
    // 同步更新 workspaces 数组，保证侧边栏/选择器等读数组的地方立即反映改名/改 Logo
    setWorkspaces((prev) => {
      const exists = prev.some((w) => w.id === workspace.id);
      if (!exists) return [...prev, workspace];
      return prev.map((w) => (w.id === workspace.id ? workspace : w));
    });
    localStorage.setItem('current_workspace_id', workspace.id);
  }, []);

  // ── 账号变化时重置工作空间 ──────────────────────────────────
  // 修复：切换账号（登出 → 登录另一个账号）后，WorkspaceProvider 常驻不卸载，
  // 旧账号的 currentWorkspace/workspaces state 与 localStorage.current_workspace_id
  // 会残留，导致新账号登录后继续使用旧账号的工作空间 → 报错、需手动切换。
  // 这里监听 user.id：登出时彻底清空；账号变化时清掉旧缓存并重新拉取（自动归属校验）。
  const lastUserIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const userId = user?.id ?? null;
    const firstRun = !initializedRef.current;
    initializedRef.current = true;
    const prevUserId = lastUserIdRef.current;
    const userChanged = prevUserId !== userId;
    lastUserIdRef.current = userId;

    if (!userId) {
      // 仅当「曾经登录过 → 登出」时才清空。
      // 页面刷新首次挂载时 auth 尚在验证（user 为 null），不能动用户手动选的 workspace。
      if (prevUserId !== null) {
        setWorkspaces([]);
        setCurrentWorkspace(null);
        localStorage.removeItem('current_workspace_id');
      }
      return;
    }

    if (userChanged && !firstRun) {
      // 真正发生了账号切换（A→B）：清除旧 id，重新拉取并归属校验
      localStorage.removeItem('current_workspace_id');
      void fetchWorkspaces();
    }
    // firstRun 时由 Sidebar 挂载触发 fetchWorkspaces，避免重复请求
  }, [user?.id, fetchWorkspaces]);

  const value = useMemo(
    () => ({
      currentWorkspace,
      workspaces,
      isLoading,
      setWorkspace,
      fetchWorkspaces,
    }),
    [currentWorkspace, workspaces, isLoading, setWorkspace, fetchWorkspaces]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};
