// ============================================================
// Nexora - TypeScript Type Definitions
// Aligned with backend schemas
// ============================================================

// --- User ---
export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  is_active: boolean;
  is_superadmin: boolean;
  email_verified: boolean;
  totp_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// --- Workspace ---
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_name?: string | null;
  brand_logo_url?: string | null;
  brand_color?: string | null;
  brand_dark_mode?: boolean;
  created_at: string;
  updated_at: string;
  member_count?: number;
  role?: WorkspaceRole;
}

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

// --- Workspace Member (flat structure, matches backend) ---
export interface WorkspaceMember {
  id: string;
  user_id: string;
  workspace_id: string;
  role: WorkspaceRole;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  invited_at: string;
  joined_at: string | null;
}

// --- Subscription ---
export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  price_yearly: number;
  max_members: number;
  max_workspaces: number;
  features: Record<string, any>;
  is_active: boolean;
}

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';

export interface Subscription {
  id: string;
  workspace_id: string;
  plan_id: string;
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  payment_status: string;
  created_at: string;
}

// --- API Key ---
export type ApiKeyScope = 'read' | 'write' | 'admin';

export interface ApiKey {
  id: string;
  workspace_id: string;
  name: string;
  key_prefix: string;
  last_4: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ApiKeyCreatedResponse {
  api_key: ApiKey;
  raw_key: string;
}

// --- Audit Log ---
export interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string | null;
  user: User;
  created_at: string;
}

// --- Auth ---
export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
  remember_me?: boolean;
  totp_code?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

// --- API Responses ---
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiError {
  detail: string;
  code?: string;
  errors?: Record<string, string[]>;
}

// --- Dashboard Stats ---
export interface DashboardStats {
  total_members: number;
  active_api_keys: number;
  subscription_status: SubscriptionStatus;
  days_remaining: number;
  recent_activity: AuditLog[];
}

// --- Admin Stats (matches backend response structure) ---
export interface AdminStats {
  users: {
    total: number;
    active: number;
  };
  workspaces: {
    total: number;
  };
  memberships: {
    total: number;
  };
  subscriptions: {
    active: number;
    trialing: number;
  };
  plans: {
    total: number;
  };
}

// --- Invite ---
export interface InviteRequest {
  email: string;
  role: WorkspaceRole;
}

// --- Workspace Update ---
export interface WorkspaceUpdateRequest {
  name?: string;
  logo_url?: string | null;
  brand_name?: string | null;
  brand_logo_url?: string | null;
  brand_color?: string | null;
  brand_dark_mode?: boolean;
}

// --- Webhook ---
export interface Webhook {
  id: string;
  workspace_id: string;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
}
