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

function normalizeProject(raw: any): Project {
  return {
    id: raw.id,
    org_id: raw.org_id,
    name: raw.name,
    description: raw.description ?? undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at ?? null,
    memory_count: raw.memory_count ?? undefined,
  };
}

function normalizeMemory(raw: any): Memory {
  const content = raw?.content ?? raw?.body ?? '';
  return {
    id: raw.id,
    project_id: raw.project_id,
    type: raw.type,
    source: raw.source ?? 'manual',
    title: raw.title ?? '',
    body: content,
    content,
    metadata: raw.metadata ?? {},
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    created_at: raw.created_at,
    updated_at: raw.updated_at ?? null,
  };
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
  org_id?: number;
  name: string;
  description?: string;
  created_at: string;
  updated_at?: string | null;
  memory_count?: number;
}

export const projects = {
  list: async () => {
    const rows = await request<any[]>('/api/projects');
    return rows.map(normalizeProject);
  },

  create: (data: { name: string; description?: string }) =>
    request<any>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(normalizeProject),

  get: (id: number) => request<any>(`/api/projects/${id}`).then(normalizeProject),

  update: (id: number, data: { name?: string; description?: string }) =>
    request<any>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then(normalizeProject),

  delete: (id: number) =>
    request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
};

// ── Memories ──────────────────────────────────────────────────
export interface Memory {
  id: number;
  project_id: number;
  type: string;
  source?: string;
  title: string | null;
  body: string;
  content?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  created_at: string;
  updated_at?: string | null;
}

export const memories = {
  list: async (projectId: number) => {
    const rows = await request<any[]>(`/api/projects/${projectId}/memories`);
    return rows.map(normalizeMemory);
  },

  get: (projectId: number, memId: number) =>
    request<any>(`/api/projects/${projectId}/memories/${memId}`).then(normalizeMemory),

  create: (projectId: number, data: Partial<Memory>) =>
    request<any>(`/api/projects/${projectId}/memories`, {
      method: 'POST',
      body: JSON.stringify({
        type: data.type,
        source: data.source ?? 'manual',
        title: data.title,
        content: data.content ?? data.body ?? '',
        metadata: data.metadata ?? {},
        tags: data.tags ?? [],
      }),
    }).then(normalizeMemory),

  update: (
    projectId: number,
    memId: number,
    data: { title?: string; body?: string; content?: string; type?: string; source?: string; tags?: string[]; metadata?: Record<string, unknown> }
  ) =>
    request<any>(`/api/projects/${projectId}/memories/${memId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: data.title,
        content: data.content ?? data.body,
        type: data.type,
        source: data.source,
        tags: data.tags,
        metadata: data.metadata,
      }),
    }).then(normalizeMemory),

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

function normalizeRecallResult(raw: any): RecallResult {
  return {
    project_id: raw.project_id,
    query: raw.query,
    memory_pack_text: raw.memory_pack_text,
    items: Array.isArray(raw.items) ? raw.items.map((item: any) => ({
      ...normalizeMemory(item),
      rank_score: item.rank_score ?? null,
    })) : [],
  };
}

export const recall = {
  query: (projectId: number, q: string) =>
    request<any>(`/api/projects/${projectId}/recall?query=${encodeURIComponent(q)}`).then(normalizeRecallResult),

  search: (projectId: number, q: string) =>
    request<any>(
      `/api/projects/${projectId}/search?query=${encodeURIComponent(q)}`
    ).then((raw) => ({
      project_id: raw.project_id,
      query: raw.query,
      total: raw.total,
      items: Array.isArray(raw.items) ? raw.items.map((item: any) => ({
        ...normalizeMemory(item),
        rank_score: item.rank_score ?? null,
      })) : [],
    })),
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
    request<any>(`/api/inbox/${itemId}/approve`, {
      method: 'POST',
      body: JSON.stringify(edits ?? {}),
    }).then(normalizeMemory),

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

  updateMembership: (orgId: number, membershipId: number, data: { role: string }) =>
    request<OrgMember>(`/api/orgs/${orgId}/memberships/${membershipId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  removeMembership: (orgId: number, membershipId: number) =>
    request<void>(`/api/orgs/${orgId}/memberships/${membershipId}`, {
      method: 'DELETE',
    }),

  auditLogs: (orgId: number, params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    const suffix = query.toString() ? `?${query}` : '';
    return request<AuditLog[]>(`/api/orgs/${orgId}/audit-logs${suffix}`);
  },
};

// ── Usage (per-user) ──────────────────────────────────────────
export interface UsageLimits {
  daily_memories?: number;
  daily_recall_queries?: number;
  daily_projects?: number;
  memories_per_day: number;
  recalls_per_day: number;
  projects_per_day: number;
  weekly_memories?: number;
  weekly_recall_queries?: number;
  weekly_projects?: number;
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

export interface AdminWaitlistEntry {
  id: number;
  email: string;
  name: string | null;
  company: string | null;
  use_case: string | null;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_admin_id: number | null;
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
  served_by?: string | null;
  duration_ms?: number | null;
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
  listUsers: () => request<AdminUser[]>('/api/admin/users'),
  userStats: (userId: number) => request<AdminUserStats>(`/api/admin/users/${userId}/stats`),
  loginEvents: (userId: number) => request<LoginEvent[]>(`/api/admin/users/${userId}/login-events`),
  disableUser: (userId: number) => request<void>(`/api/admin/users/${userId}/disable`, { method: 'POST' }),
  enableUser: (userId: number) => request<void>(`/api/admin/users/${userId}/enable`, { method: 'POST' }),
  grantAdmin: (userId: number) => request<void>(`/api/admin/users/${userId}/grant-admin`, { method: 'POST' }),
  revokeAdmin: (userId: number) => request<void>(`/api/admin/users/${userId}/revoke-admin`, { method: 'POST' }),
  revokeSessions: (userId: number) => request<void>(`/api/admin/users/${userId}/revoke-sessions`, { method: 'POST' }),
  setUnlimited: (userId: number, unlimited: boolean) =>
    request<void>(`/api/admin/users/${userId}/set-unlimited?unlimited=${String(unlimited)}`, {
      method: 'POST',
    }),

  orgs: () => request<Org[]>('/api/admin/orgs'),

  invites: () => request<AdminInvite[]>('/api/admin/invites'),
  listInvites: () => request<AdminInvite[]>('/api/admin/invites'),
  createInvite: (email: string, notes?: string) =>
    request<AdminInvite>('/api/admin/invites', {
      method: 'POST',
      body: JSON.stringify({ email, notes }),
    }),
  revokeInvite: (inviteId: number) =>
    request<void>(`/api/admin/invites/${inviteId}/revoke`, { method: 'POST' }),

  waitlist: () => request<AdminWaitlistEntry[]>('/api/admin/waitlist'),
  approveWaitlist: (entryId: number) =>
    request<AdminInvite>(`/api/admin/waitlist/${entryId}/approve`, { method: 'POST' }),
  rejectWaitlist: (entryId: number) =>
    request<void>(`/api/admin/waitlist/${entryId}/reject`, { method: 'POST' }),

  usage: () => request<AdminUsageRow[]>('/api/admin/usage'),

  recallLogs: (limit?: number, offset?: number, projectId?: number) => {
    const query = new URLSearchParams();
    if (limit != null) query.set('limit', String(limit));
    if (offset != null) query.set('offset', String(offset));
    if (projectId != null) query.set('project_id', String(projectId));
    const suffix = query.toString() ? `?${query}` : '';
    return request<AdminRecallLog[]>(`/api/admin/recall/logs${suffix}`);
  },

  cagCacheStats: () => request<CagCacheStats>('/api/admin/cag/cache-stats'),
  cagStats: () => request<CagCacheStats>('/api/admin/cag/cache-stats'),
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
