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

// ── Brain batch actions ──────────────────────────────────────
export type BrainBatchActionType =
  | 'add_tag'
  | 'remove_tag'
  | 'change_type'
  | 'pin'
  | 'unpin'
  | 'export'
  | 'open_in_recall';

export interface BrainBatchAction {
  type: BrainBatchActionType;
  targetIds: string[];
  tagId?: string;
  newType?: string;
  exportFormat?: 'json' | 'csv';
}

export interface BrainBatchRequest {
  actionId: string;
  action: BrainBatchAction;
}

export interface BrainBatchResultItem {
  id: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface BrainBatchResponse {
  actionId: string;
  type: BrainBatchActionType;
  results: BrainBatchResultItem[];
  total: number;
  succeeded: number;
  failed: number;
  exported: Array<Record<string, unknown>>;
  selected_memory_ids: number[];
}

export const brain = {
  batch: (payload: BrainBatchRequest, idempotencyKey?: string) =>
    request<BrainBatchResponse>('/api/brain/batch', {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: JSON.stringify(payload),
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
  compilation_id: number | null;
  renderer: string;
  requested_format: string;
  resolved_format: string;
  format_resolution_reason: string | null;
  query_profile_id: number | null;
}

function normalizeRecallResult(raw: any): RecallResult {
  return {
    project_id: raw.project_id,
    query: raw.query,
    memory_pack_text: raw.memory_pack_text,
    compilation_id: raw.compilation_id ?? null,
    renderer: raw.renderer ?? 'recall-pack/v1',
    requested_format: raw.requested_format ?? 'text',
    resolved_format: raw.resolved_format ?? raw.requested_format ?? 'text',
    format_resolution_reason: raw.format_resolution_reason ?? null,
    query_profile_id: raw.query_profile_id ?? null,
    items: Array.isArray(raw.items) ? raw.items.map((item: any) => ({
      ...normalizeMemory(item),
      rank_score: item.rank_score ?? null,
    })) : [],
  };
}

export type RecallFormat = 'text' | 'toon' | 'toonx' | 'auto';
export type RecallFeedbackLabel = 'helpful' | 'wrong' | 'stale' | 'removed' | 'pinned';

export interface RecallFeedback {
  id: number;
  compilation_id: number;
  query_profile_id: number | null;
  label: RecallFeedbackLabel;
  entity_type: string;
  entity_id: number | null;
  note: string | null;
  created_at: string;
}

export const recall = {
  query: (projectId: number, q: string, format: RecallFormat = 'text') =>
    request<any>(`/api/projects/${projectId}/recall?query=${encodeURIComponent(q)}&format=${encodeURIComponent(format)}`).then(normalizeRecallResult),

  submitFeedback: (
    projectId: number,
    payload: { compilation_id: number; label: RecallFeedbackLabel; entity_id?: number; note?: string; metadata?: Record<string, unknown> }
  ) =>
    request<RecallFeedback>(`/api/projects/${projectId}/recall/feedback`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

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

export const compiler = {
  compile: (projectId: number, payload: { query: string; limit?: number; format?: RecallFormat }) =>
    request<any>(`/api/projects/${projectId}/context/compile`, {
      method: 'POST',
      body: JSON.stringify({
        query: payload.query,
        limit: payload.limit ?? 10,
        format: payload.format ?? 'text',
      }),
    }).then(normalizeRecallResult),
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

export interface AdminRecallFeedback {
  id: number;
  org_id: number;
  project_id: number;
  compilation_id: number;
  query_profile_id: number | null;
  actor_user_id: number | null;
  entity_type: string;
  entity_id: number | null;
  label: RecallFeedbackLabel;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminContextCompilationItem {
  id: number;
  entity_type: string;
  entity_id: number | null;
  rank: number | null;
  token_estimate: number | null;
  why_included: string | null;
  source_kind: string | null;
  created_at: string;
}

export interface AdminContextCompilationDetail {
  id: number;
  org_id: number;
  project_id: number;
  actor_user_id: number | null;
  query_text: string;
  bundle_id: string | null;
  target_format: string;
  renderer: string | null;
  retrieval_strategy: string | null;
  served_by: string | null;
  status: string;
  latency_ms: number | null;
  compilation_text: string | null;
  compilation_json: Record<string, unknown>;
  item_count: number;
  feedback_count: number;
  items: AdminContextCompilationItem[];
  recent_feedback: AdminRecallFeedback[];
  query_profile_id: number | null;
  created_at: string;
}

export interface AdminContextCompilationHistoryEntry {
  id: number;
  query_text: string;
  target_format: string;
  renderer: string | null;
  retrieval_strategy: string | null;
  served_by: string | null;
  item_count: number;
  feedback_count: number;
  created_at: string;
}

export interface AdminContextCompilationDiff {
  base_compilation_id: number;
  other_compilation_id: number;
  query_text: string;
  base_target_format: string;
  other_target_format: string;
  base_retrieval_strategy: string | null;
  other_retrieval_strategy: string | null;
  base_served_by: string | null;
  other_served_by: string | null;
  target_format_changed: boolean;
  retrieval_strategy_changed: boolean;
  served_by_changed: boolean;
  bundle_changed: boolean;
  text_changed: boolean;
  base_bundle_id: string | null;
  other_bundle_id: string | null;
  base_item_count: number;
  other_item_count: number;
  item_ids_added: number[];
  item_ids_removed: number[];
  retrieval_plan_before: Record<string, unknown>;
  retrieval_plan_after: Record<string, unknown>;
  feedback_delta: number;
}

export interface AdminRecallEval {
  lookback_days: number;
  total_queries: number;
  empty_query_count: number;
  no_result_count: number;
  total_feedback: number;
  query_profile_count: number;
  strategy_counts: Record<string, number>;
  served_by_counts: Record<string, number>;
  source_counts: Record<string, number>;
  feedback_label_counts: Record<string, number>;
  preferred_format_counts: Record<string, number>;
  avg_ranked_results: number | null;
  avg_total_duration_ms: number | null;
  avg_cag_duration_ms: number | null;
  avg_rag_duration_ms: number | null;
  max_total_duration_ms: number | null;
}

export interface AdminQueryProfile {
  id: number;
  org_id: number;
  project_id: number;
  actor_user_id: number | null;
  normalized_query: string;
  sample_query: string;
  preferred_target_format: string | null;
  last_target_format: string | null;
  last_strategy: string | null;
  last_served_by: string | null;
  total_queries: number;
  helpful_count: number;
  wrong_count: number;
  stale_count: number;
  removed_count: number;
  pinned_count: number;
  feedback_total: number;
  positive_feedback_count: number;
  negative_feedback_count: number;
  auto_apply_enabled: boolean;
  auto_apply_disabled: boolean;
  suggested_target_format: string | null;
  suggestion_reason: string | null;
  suggestion_confidence: number | null;
  suggestion_state: string;
  last_compilation_id: number | null;
  last_queried_at: string | null;
  last_feedback_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminQueryProfileDetail extends AdminQueryProfile {
  recent_feedback: AdminRecallFeedback[];
}

export interface AdminRecallMemorySignal {
  memory_id: number;
  project_id: number;
  memory_type: string;
  title: string | null;
  helpful_count: number;
  wrong_count: number;
  stale_count: number;
  removed_count: number;
  pinned_count: number;
  feedback_total: number;
  net_score: number;
  last_feedback_at: string | null;
}

export interface AdminRecallMemorySignalDetail extends AdminRecallMemorySignal {
  source: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  marked_for_review: boolean;
  archived_from_recall_admin: boolean;
  review_status: string;
  review_notes: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string | null;
}

export interface AdminRecallReviewQueueItem {
  memory_id: number;
  project_id: number;
  memory_type: string;
  title: string | null;
  source: string;
  feedback_total: number;
  net_score: number;
  review_status: string;
  marked_for_review: boolean;
  archived_from_recall_admin: boolean;
  review_marked_at: string | null;
  archived_at: string | null;
  latest_note: string | null;
  notes_count: number;
  last_feedback_at: string | null;
  created_at: string;
  updated_at: string | null;
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

export interface AdminLlmHealth {
  provider: string;
  model: string;
  worker_enabled: boolean;
  google_api_key_configured: boolean;
  google_genai_installed: boolean;
  ready: boolean;
  notes: string[];
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

  recallCompilationDetail: (compilationId: number) =>
    request<AdminContextCompilationDetail>(`/api/admin/recall/compilations/${compilationId}`),

  recallCompilationHistory: (compilationId?: number, queryText?: string, limit = 10) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (compilationId != null) query.set('compilation_id', String(compilationId));
    if (queryText) query.set('query_text', queryText);
    return request<AdminContextCompilationHistoryEntry[]>(`/api/admin/recall/compilations/history?${query.toString()}`);
  },

  recallCompilationDiff: (compilationId: number, otherId?: number) => {
    const query = new URLSearchParams();
    if (otherId != null) query.set('other_id', String(otherId));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<AdminContextCompilationDiff>(`/api/admin/recall/compilations/${compilationId}/diff${suffix}`);
  },

  recallEval: (lookbackDays = 7, projectId?: number) => {
    const query = new URLSearchParams({ lookback_days: String(lookbackDays) });
    if (projectId != null) query.set('project_id', String(projectId));
    return request<AdminRecallEval>(`/api/admin/recall/eval?${query.toString()}`);
  },

  recallFeedback: (limit?: number, offset?: number, projectId?: number, label?: RecallFeedbackLabel) => {
    const query = new URLSearchParams();
    if (limit != null) query.set('limit', String(limit));
    if (offset != null) query.set('offset', String(offset));
    if (projectId != null) query.set('project_id', String(projectId));
    if (label) query.set('label', label);
    const suffix = query.toString() ? `?${query}` : '';
    return request<AdminRecallFeedback[]>(`/api/admin/recall/feedback${suffix}`);
  },

  queryProfiles: (limit?: number, offset?: number, projectId?: number, hasFeedback?: boolean) => {
    const query = new URLSearchParams();
    if (limit != null) query.set('limit', String(limit));
    if (offset != null) query.set('offset', String(offset));
    if (projectId != null) query.set('project_id', String(projectId));
    if (hasFeedback != null) query.set('has_feedback', String(hasFeedback));
    const suffix = query.toString() ? `?${query}` : '';
    return request<AdminQueryProfile[]>(`/api/admin/recall/query-profiles${suffix}`);
  },

  queryProfileDetail: (profileId: number) =>
    request<AdminQueryProfileDetail>(`/api/admin/recall/query-profiles/${profileId}`),

  setQueryProfilePreferredFormat: (profileId: number, preferredTargetFormat: string | null) =>
    request<AdminQueryProfile>(`/api/admin/recall/query-profiles/${profileId}/preferred-format`, {
      method: 'POST',
      body: JSON.stringify({ preferred_target_format: preferredTargetFormat }),
    }),

  acceptQueryProfileSuggestion: (profileId: number) =>
    request<AdminQueryProfile>(`/api/admin/recall/query-profiles/${profileId}/accept-suggestion`, {
      method: 'POST',
    }),

  rejectQueryProfileSuggestion: (profileId: number) =>
    request<AdminQueryProfile>(`/api/admin/recall/query-profiles/${profileId}/reject-suggestion`, {
      method: 'POST',
    }),

  disableQueryProfileAutoApply: (profileId: number, disabled = true) =>
    request<AdminQueryProfile>(`/api/admin/recall/query-profiles/${profileId}/disable-auto-apply?disabled=${String(disabled)}`, {
      method: 'POST',
    }),

  resetQueryProfileFeedback: (profileId: number) =>
    request<AdminQueryProfile>(`/api/admin/recall/query-profiles/${profileId}/reset-feedback`, {
      method: 'POST',
    }),

  recallMemorySignals: (limit?: number, projectId?: number) => {
    const query = new URLSearchParams();
    if (limit != null) query.set('limit', String(limit));
    if (projectId != null) query.set('project_id', String(projectId));
    const suffix = query.toString() ? `?${query}` : '';
    return request<AdminRecallMemorySignal[]>(`/api/admin/recall/memory-signals${suffix}`);
  },

  recallReviewQueue: (limit?: number, projectId?: number, includeArchived = true, includeResolved = false) => {
    const query = new URLSearchParams();
    if (limit != null) query.set('limit', String(limit));
    if (projectId != null) query.set('project_id', String(projectId));
    query.set('include_archived', String(includeArchived));
    query.set('include_resolved', String(includeResolved));
    return request<AdminRecallReviewQueueItem[]>(`/api/admin/recall/review-queue?${query.toString()}`);
  },

  recallMemorySignalDetail: (memoryId: number) =>
    request<AdminRecallMemorySignalDetail>(`/api/admin/recall/memory-signals/${memoryId}`),

  markMemorySignalForReview: (memoryId: number) =>
    request<AdminRecallMemorySignalDetail>(`/api/admin/recall/memory-signals/${memoryId}/mark-review`, {
      method: 'POST',
    }),

  archiveMemorySignal: (memoryId: number) =>
    request<AdminRecallMemorySignalDetail>(`/api/admin/recall/memory-signals/${memoryId}/archive`, {
      method: 'POST',
    }),

  resolveMemorySignalReview: (memoryId: number, note?: string) =>
    request<AdminRecallMemorySignalDetail>(`/api/admin/recall/memory-signals/${memoryId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ note: note ?? null }),
    }),

  reopenMemorySignalReview: (memoryId: number, note?: string) =>
    request<AdminRecallMemorySignalDetail>(`/api/admin/recall/memory-signals/${memoryId}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ note: note ?? null }),
    }),

  noteMemorySignalReview: (memoryId: number, note: string) =>
    request<AdminRecallMemorySignalDetail>(`/api/admin/recall/memory-signals/${memoryId}/note`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  cagCacheStats: () => request<CagCacheStats>('/api/admin/cag/cache-stats'),
  cagStats: () => request<CagCacheStats>('/api/admin/cag/cache-stats'),
  cagEvaporate: () => request<CagCacheStats>('/api/admin/cag/evaporate', { method: 'POST' }),
  llmHealth: () => request<AdminLlmHealth>('/api/admin/system/llm-health'),
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
