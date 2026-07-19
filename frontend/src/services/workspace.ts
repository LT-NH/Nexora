import api from './api';
import type { Workspace, WorkspaceMember, WorkspaceUpdateRequest, InviteRequest, WorkspaceRole } from '@/types';

/** Extract items from paginated response, or return data as-is if already an array.
 *  Falls back to an empty array when the response is not an array or a valid paginated object. */
function extractItems<T>(data: unknown): T {
  if (Array.isArray(data)) return data as T;
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as { items: unknown }).items;
    return (Array.isArray(items) ? items : []) as T;
  }
  // Defensive: return empty array for non-array, non-paginated responses
  return ([] as unknown) as T;
}

export const workspaceService = {
  async getWorkspaces(): Promise<Workspace[]> {
    const response = await api.get<Workspace[]>('/workspaces');
    return extractItems<Workspace[]>(response.data);
  },

  async createWorkspace(data: { name: string; slug: string; logo_url?: string | null }): Promise<Workspace> {
    const response = await api.post<Workspace>('/workspaces', data);
    return response.data;
  },

  async getWorkspace(workspaceSlug: string): Promise<Workspace> {
    const response = await api.get<Workspace>(`/workspaces/${workspaceSlug}`);
    return response.data;
  },

  async updateWorkspace(
    workspaceSlug: string,
    data: WorkspaceUpdateRequest
  ): Promise<Workspace> {
    const response = await api.put<Workspace>(`/workspaces/${workspaceSlug}`, data);
    return response.data;
  },

  async deleteWorkspace(workspaceSlug: string): Promise<void> {
    await api.delete(`/workspaces/${workspaceSlug}`);
  },

  async getMembers(workspaceSlug: string): Promise<WorkspaceMember[]> {
    const response = await api.get<WorkspaceMember[]>(
      `/workspaces/${workspaceSlug}/members`
    );
    return extractItems<WorkspaceMember[]>(response.data);
  },

  async inviteMember(
    workspaceSlug: string,
    data: InviteRequest
  ): Promise<WorkspaceMember> {
    const response = await api.post<WorkspaceMember>(
      `/workspaces/${workspaceSlug}/members`,
      data
    );
    return response.data;
  },

  async removeMember(workspaceSlug: string, userId: string): Promise<void> {
    await api.delete(`/workspaces/${workspaceSlug}/members/${userId}`);
  },

  async changeRole(
    workspaceSlug: string,
    userId: string,
    role: WorkspaceRole
  ): Promise<WorkspaceMember> {
    const response = await api.put<WorkspaceMember>(
      `/workspaces/${workspaceSlug}/members/${userId}/role`,
      { role }
    );
    return response.data;
  },
};
