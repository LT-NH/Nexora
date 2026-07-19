import api from './api';
import type { SubscriptionPlan, Subscription } from '@/types';

export const subscriptionService = {
  async getPlans(): Promise<SubscriptionPlan[]> {
    const response = await api.get<SubscriptionPlan[]>('/subscriptions/plans');
    return response.data;
  },

  async getSubscription(workspaceSlug: string): Promise<Subscription> {
    const response = await api.get<Subscription>(
      `/subscriptions/workspace/${workspaceSlug}/subscription`
    );
    return response.data;
  },

  async subscribe(
    workspaceSlug: string,
    data: { plan_slug: string; billing_cycle: 'monthly' | 'yearly' }
  ): Promise<Subscription> {
    const response = await api.post<Subscription>(
      `/subscriptions/workspace/${workspaceSlug}/subscribe`,
      data
    );
    return response.data;
  },

  async cancelSubscription(workspaceSlug: string): Promise<Subscription> {
    const response = await api.post<Subscription>(
      `/subscriptions/workspace/${workspaceSlug}/cancel`
    );
    return response.data;
  },

  async verifyPayment(workspaceSlug: string): Promise<Subscription> {
    const response = await api.post<Subscription>(
      `/subscriptions/workspace/${workspaceSlug}/verify-payment`
    );
    return response.data;
  },

  async switchPlan(workspaceSlug: string, planSlug: string): Promise<Subscription> {
    const response = await api.post<Subscription>(
      `/subscriptions/workspace/${workspaceSlug}/switch-plan`,
      { plan_slug: planSlug }
    );
    return response.data;
  },
};
