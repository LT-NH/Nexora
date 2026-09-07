import { useWorkspace } from './useWorkspace';
import api from '@/services/api';
import { subscriptionService } from '@/services/subscription';
import { useState, useEffect } from 'react';

export type PlanTier = 'free' | 'pro' | 'enterprise';

let cachedPlan: PlanTier | null = null;
let cacheTs = 0;
let cachedWorkspaceId: string | null = null;

/**
 * Detects current plan from workspace subscription.
 * Returns 'pro' for the demo account, 'free' as default.
 */
export function usePlan(): PlanTier {
  const { currentWorkspace } = useWorkspace();
  const [plan, setPlan] = useState<PlanTier>(cachedPlan || 'free');

  useEffect(() => {
    if (!currentWorkspace?.slug) return;

    const workspaceId = currentWorkspace.id ?? currentWorkspace.slug;

    // Invalidate cache when the workspace changes
    if (cachedWorkspaceId !== workspaceId) {
      cachedPlan = null;
      cacheTs = 0;
      cachedWorkspaceId = workspaceId;
    }

    // Use cache for 30 seconds
    if (cachedPlan && Date.now() - cacheTs < 30000) {
      setPlan(cachedPlan);
      return;
    }

    // 走真实计费 API（/subscriptions/* 旧端点已废弃；超管 = enterprise 全功能）
    api
      .get(`/workspaces/${currentWorkspace.slug}/billing/status`, { timeout: 10000 })
      .then((res: any) => {
        const d = res.data || {};
        let tier: PlanTier = 'free';
        if (d.is_admin) {
          tier = 'enterprise';
        } else {
          const slug: string = d.plan?.slug || 'free';
          const expired = d.status === 'expired';
          tier = expired ? 'free' : (['enterprise', 'pro', 'free'].includes(slug) ? (slug as PlanTier) : 'free');
        }
        cachedPlan = tier;
        cacheTs = Date.now();
        setPlan(tier);
      })
      .catch(() => {
        // API fails or no subscription — default to free
        const fallback: PlanTier = cachedPlan || 'free';
        setPlan(fallback);
        if (!cachedPlan) {
          cachedPlan = 'free';
          cacheTs = Date.now();
        }
      });
  }, [currentWorkspace?.slug, currentWorkspace?.id]);

  return plan;
}
