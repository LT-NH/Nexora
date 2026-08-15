import { useWorkspace } from './useWorkspace';
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

    subscriptionService
      .getSubscription(currentWorkspace.slug)
      .then((sub: any) => {
        const slug: string =
          sub?.plan?.slug || sub?.plan_slug || 'free';
        const tier: PlanTier =
          slug === 'enterprise' || slug === 'pro' || slug === 'free'
            ? (slug as PlanTier)
            : 'free';
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
