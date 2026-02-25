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
  requestLink: (email: string) =>
    request<{ message: string; debug_link?: string }>('/api/auth/request-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verify: (token: string) =>
    request<{ user: { id: number; email: string; is_admin: boolean } }>(`/api/auth/verify?token=${token}`),

  me: () =>
    request<{ id: number; email: string; is_admin: boolean }>('/api/auth/me'),

  logout: () =>
    request<void>('/api/auth/logout', { method: 'POST' }),

  clear: () =>
    request<void>('/api/auth/clear', { method: 'POST' }),
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
export const recall = {
  query: (projectId: number, query: string) =>
    request<unknown>(`/api/projects/${projectId}/recall?query=${encodeURIComponent(query)}`),
};

// ── API Keys ──────────────────────────────────────────────────
export interface ApiKey {
  id: number;
  label: string;
  prefix: string;
  created_at: string;
  last_used_at?: string;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
}

export const apiKeys = {
  list: () => request<ApiKey[]>('/api/api-keys'),

  create: (label: string) =>
    request<ApiKeyCreated>('/api/api-keys', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),

  revoke: (id: number) =>
    request<void>(`/api/api-keys/${id}`, { method: 'DELETE' }),
};

// ── Orgs ──────────────────────────────────────────────────────
export interface Org {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

export const orgs = {
  list: () => request<Org[]>('/api/me/orgs'),

  get: (id: number) => request<Org>(`/api/orgs/${id}`),

  update: (id: number, data: Partial<Org>) =>
    request<Org>(`/api/orgs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

// ── Admin ─────────────────────────────────────────────────────
export const admin = {
  users: () => request<unknown[]>('/api/admin/users'),
  orgs: () => request<unknown[]>('/api/admin/orgs'),
  waitlist: () => request<unknown[]>('/api/admin/waitlist'),
  invite: (email: string) =>
    request<unknown>('/api/admin/invite', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  usage: () => request<unknown>('/api/admin/usage'),
};

// ── Health ────────────────────────────────────────────────────
export const health = {
  check: () => request<{ status: string }>('/api/health'),
};

// ── Waitlist ──────────────────────────────────────────────────
export const waitlist = {
  join: (data: { email: string; name?: string; company?: string; use_case?: string }) =>
    request<{ message: string }>('/api/waitlist/join', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export { ApiError };
