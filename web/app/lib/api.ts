import { ORG_ID_KEY } from './constants';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function getOrgId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ORG_ID_KEY);
}

function requireOrgId(): string {
  const id = getOrgId();
  if (!id) throw new ApiError('No organisation selected', 400);
  return id;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const orgId = getOrgId();
  if (orgId) {
    headers['X-Org-Id'] = orgId;
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.text();
    let message: string;
    try {
      const json = JSON.parse(body);
      message = json.detail || json.message || body;
    } catch {
      message = body;
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// ── Auth ──────────────────────────────────────────────────────
export const auth = {
  /** Returns { status, detail } — debug_link never exposed to UI. */
  requestLink: (email: string) =>
    request<{ status: string; detail: string }>('/api/auth/request-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verify: (token: string) =>
    request<{ user: { id: number; email: string; is_admin: boolean } }>(`/api/auth/verify?token=${token}`),

  me: () =>
    request<{
      email: string;
      is_admin: boolean;
      is_unlimited: boolean;
      created_at: string;
      last_login_at: string | null;
    }>('/api/auth/me'),

  logout: () =>
    request<void>('/api/auth/logout', { method: 'POST' }),
};

// ── Projects ──────────────────────────────────────────────────
export interface Project {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  memory_count?: number;
}

export const projects = {
  list: () => request<Project[]>('/api/projects'),

  create: (data: { name: string; description?: string }) =>
    request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  get: (id: number) => request<Project>(`/api/projects/${id}`),

  delete: (id: number) =>
    request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
};

// ── Memories ──────────────────────────────────────────────────
export interface Memory {
  id: number;
  project_id: number;
  type: string;
  title: string;
  body: string;
  tags?: string[];
  created_at: string;
}

export const memories = {
  list: (projectId: number) =>
    request<Memory[]>(`/api/projects/${projectId}/memories`),

  create: (projectId: number, data: Partial<Memory>) =>
    request<Memory>(`/api/projects/${projectId}/memories`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (projectId: number, memoryId: number) =>
    request<void>(`/api/projects/${projectId}/memories/${memoryId}`, {
      method: 'DELETE',
    }),
};

// ── Recall ────────────────────────────────────────────────────
export interface RecallItem extends Memory {
  rank_score: number | null;
}

export interface RecallResult {
  project_id: number;
  query: string;
  memory_pack_text: string;
  items: RecallItem[];
}

export const recall = {
  query: (projectId: number, q: string) =>
    request<RecallResult>(`/api/projects/${projectId}/recall?query=${encodeURIComponent(q)}`),

  search: (projectId: number, q: string) =>
    request<{ project_id: number; query: string; total: number; items: RecallItem[] }>(
      `/api/projects/${projectId}/search?query=${encodeURIComponent(q)}`
    ),
};

// ── Inbox ─────────────────────────────────────────────────────
export interface InboxItem {
  id: number;
  project_id: number;
  raw_capture_id: number | null;
  promoted_memory_id: number | null;
  suggested_type: string;
  suggested_title: string | null;
  suggested_content: string;
  confidence_score: number;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}

export interface InboxList {
  project_id: number;
  total: number;
  items: InboxItem[];
}

export const inbox = {
  list: (projectId: number) =>
    request<InboxList>(`/api/projects/${projectId}/inbox`),

  approve: (itemId: number, edits?: { suggested_type?: string; suggested_title?: string; suggested_content?: string }) =>
    request<Memory>(`/api/inbox/${itemId}/approve`, {
      method: 'POST',
      body: JSON.stringify(edits ?? {}),
    }),

  reject: (itemId: number) =>
    request<InboxItem>(`/api/inbox/${itemId}/reject`, { method: 'POST' }),
};

// ── API Keys (org-scoped) ─────────────────────────────────────
export interface ApiKey {
  id: number;
  org_id: number;
  name: string;
  prefix: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
}

export interface ApiKeyCreated extends ApiKey {
  api_key: string;
}

export const apiKeys = {
  list: () => {
    const orgId = requireOrgId();
    return request<ApiKey[]>(`/api/orgs/${orgId}/api-keys`);
  },

  create: (name: string) => {
    const orgId = requireOrgId();
    return request<ApiKeyCreated>(`/api/orgs/${orgId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  revoke: (keyId: number) => {
    const orgId = requireOrgId();
    return request<ApiKey>(`/api/orgs/${orgId}/api-keys/${keyId}/revoke`, {
      method: 'POST',
    });
  },
};

// ── Orgs ──────────────────────────────────────────────────────
export interface Org {
  id: number;
  name: string;
  created_at: string;
}

export interface OrgMember {
  id: number;
  org_id: number;
  user_id: number;
  email: string;
  display_name: string | null;
  role: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  org_id: number;
  actor_user_id: number | null;
  api_key_prefix: string | null;
  action: string;
  entity_type: string;
  entity_id: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const orgs = {
  list: () => request<{ id: number; name: string; role: string | null }[]>('/api/me/orgs'),

  create: (name: string) =>
    request<Org>('/api/orgs', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  get: (id: number) => request<Org>(`/api/orgs/${id}`),

  update: (id: number, data: { name: string }) =>
    request<Org>(`/api/orgs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    request<void>(`/api/orgs/${id}`, { method: 'DELETE' }),

  members: (orgId: number) =>
    request<OrgMember[]>(`/api/orgs/${orgId}/memberships`),

  addMember: (orgId: number, data: { email: string; role: string; display_name?: string }) =>
    request<OrgMember>(`/api/orgs/${orgId}/memberships`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  auditLogs: (orgId: number) =>
    request<AuditLog[]>(`/api/orgs/${orgId}/audit-logs`),
};

// ── Usage (per-user) ──────────────────────────────────────────
export interface UsageLimits {
  memories_per_day: number;
  recalls_per_day: number;
  projects_per_day: number;
  memories_per_week: number;
  recalls_per_week: number;
  projects_per_week: number;
}

export interface Usage {
  day: string;
  memories_created: number;
  recall_queries: number;
  projects_created: number;
  week_start: string;
  weekly_memories_created: number;
  weekly_recall_queries: number;
  weekly_projects_created: number;
  limits: UsageLimits;
}

export const usage = {
  me: () => request<Usage>('/api/me/usage'),
};

// ── Admin ─────────────────────────────────────────────────────
export interface AdminUser {
  id: number;
  email: string;
  created_at: string;
  last_login_at: string | null;
  is_admin: boolean;
  is_disabled: boolean;
  is_unlimited: boolean;
}

export interface AdminInvite {
  id: number;
  email: string;
  invited_by_user_id: number | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  notes: string | null;
}

export interface AdminUserStats {
  user_id: number;
  memory_count: number;
  today_memories: number;
  today_recalls: number;
  today_projects: number;
}

export interface LoginEvent {
  id: number;
  user_id: number;
  ip: string;
  user_agent: string | null;
  created_at: string;
}

export interface AdminRecallLog {
  id: number;
  org_id: number;
  project_id: number;
  actor_user_id: number | null;
  strategy: string;
  query_text: string;
  input_memory_ids: number[];
  ranked_memory_ids: number[];
  weights: Record<string, number>;
  score_details: Record<string, unknown>;
  created_at: string;
}

export interface AdminUsageRow {
  date: string;
  event_type: string;
  count: number;
}

export interface CagCacheStats {
  enabled: boolean;
  mode: string;
  embedding_model: string;
  cache_items: number;
  cache_max_items: number;
  total_queries: number;
  total_hits: number;
  total_misses: number;
  hit_rate: number;
  total_evicted: number;
  avg_pheromone: number;
  last_evaporation_at: string | null;
  evaporation_factor: number;
  evaporation_interval_seconds: number;
  kv_stub_enabled: boolean;
  kv_token_budget_used: number;
}

export const admin = {
  users: () => request<AdminUser[]>('/api/admin/users'),
  userStats: (userId: number) => request<AdminUserStats>(`/api/admin/users/${userId}/stats`),
  loginEvents: (userId: number) => request<LoginEvent[]>(`/api/admin/users/${userId}/login-events`),
  disableUser: (userId: number) => request<void>(`/api/admin/users/${userId}/disable`, { method: 'POST' }),
  enableUser: (userId: number) => request<void>(`/api/admin/users/${userId}/enable`, { method: 'POST' }),
  grantAdmin: (userId: number) => request<void>(`/api/admin/users/${userId}/grant-admin`, { method: 'POST' }),
  revokeAdmin: (userId: number) => request<void>(`/api/admin/users/${userId}/revoke-admin`, { method: 'POST' }),
  revokeSessions: (userId: number) => request<void>(`/api/admin/users/${userId}/revoke-sessions`, { method: 'POST' }),
  setUnlimited: (userId: number, unlimited: boolean) =>
    request<void>(`/api/admin/users/${userId}/set-unlimited`, {
      method: 'POST',
      body: JSON.stringify({ is_unlimited: unlimited }),
    }),

  orgs: () => request<Org[]>('/api/admin/orgs'),

  invites: () => request<AdminInvite[]>('/api/admin/invites'),
  createInvite: (email: string, notes?: string) =>
    request<AdminInvite>('/api/admin/invites', {
      method: 'POST',
      body: JSON.stringify({ email, notes }),
    }),
  revokeInvite: (inviteId: number) =>
    request<void>(`/api/admin/invites/${inviteId}/revoke`, { method: 'POST' }),

  waitlist: () => request<unknown[]>('/api/admin/waitlist'),

  usage: () => request<AdminUsageRow[]>('/api/admin/usage'),

  recallLogs: () => request<AdminRecallLog[]>('/api/admin/recall/logs'),

  cagCacheStats: () => request<CagCacheStats>('/api/admin/cag/cache-stats'),
  cagEvaporate: () => request<CagCacheStats>('/api/admin/cag/evaporate', { method: 'POST' }),
};

// ── Health ────────────────────────────────────────────────────
export const health = {
  check: () => request<{ status: string }>('/api/health'),
};

// ── Waitlist ──────────────────────────────────────────────────
export const waitlist = {
  join: (data: { email: string; name?: string; company?: string; use_case?: string }) =>
    request<{ status: string; detail: string }>('/api/waitlist', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export { ApiError };
