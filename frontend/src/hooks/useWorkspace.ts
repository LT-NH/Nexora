import { useContext } from 'react';
import { WorkspaceContext } from '@/contexts/WorkspaceContext';

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}