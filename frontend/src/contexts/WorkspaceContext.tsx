import React, { createContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Workspace } from '@/types';
import { workspaceService } from '@/services/workspace';

interface WorkspaceContextType {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  isLoading: boolean;
  setWorkspace: (workspace: Workspace) => void;
  fetchWorkspaces: () => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const currentWorkspaceRef = useRef(currentWorkspace);
  currentWorkspaceRef.current = currentWorkspace;

  const fetchWorkspaces = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await workspaceService.getWorkspaces();
      setWorkspaces(data);
      // Auto-select first workspace if none selected (use ref to avoid stale closure)
      if (!currentWorkspaceRef.current && data.length > 0) {
        setCurrentWorkspace(data[0]);
      }
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

  // Restore current workspace from localStorage (runs once when workspaces load)
  useEffect(() => {
    const storedId = localStorage.getItem('current_workspace_id');
    if (storedId && workspaces.length > 0) {
      const found = workspaces.find((w) => w.id === storedId);
      if (found) {
        setCurrentWorkspace(found);
      }
    }
  }, [workspaces]);

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