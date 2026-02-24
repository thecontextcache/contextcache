/**
 * API client for ContextCache backend.
 *
 * Reads the active API base URL from storage (defaults to production).
 * All requests include the best available credential from auth.ts.
 */
import { getAuthHeaders, getStoredAuth } from './auth'

export const API_BASE_PROD = 'https://api.thecontextcache.com'
export const API_BASE_DEV = 'http://localhost:8000'

export type IngestSource = 'chrome_ext' | 'cli' | 'mcp' | 'email'

export interface IngestPayload {
  source: IngestSource
  project_id: number
  payload: {
    text?: string
    url?: string
    title?: string
    conversation?: ConversationTurn[]
    [key: string]: unknown
  }
}

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface IngestResult {
  capture_id: number
  status: string
}

export interface Project {
  id: number
  name: string
  org_id: number
}

async function getBaseUrl(): Promise<string> {
  const result = await chrome.storage.local.get(['apiBaseUrl'])
  return (result.apiBaseUrl as string | undefined) ?? API_BASE_PROD
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const [baseUrl, authHeaders] = await Promise.all([getBaseUrl(), getAuthHeaders()])

  if (!authHeaders) {
    throw new Error('Not authenticated. Please set your API key in the extension popup.')
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`API ${response.status}: ${body}`)
  }

  return response.json() as Promise<T>
}

/** Send a raw capture to the Refinery ingestion endpoint. */
export async function ingestRaw(payload: IngestPayload): Promise<IngestResult> {
  return apiFetch<IngestResult>('/ingest/raw', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Fetch the list of projects the current user has access to. */
export async function listProjects(): Promise<Project[]> {
  // /me/orgs → pick first org → list its projects
  type OrgRow = { id: number; name: string }
  const orgs = await apiFetch<OrgRow[]>('/me/orgs')
  if (!orgs.length) return []

  const projects = await apiFetch<Project[]>(`/orgs/${orgs[0].id}/projects`)
  return projects
}

/** Quick auth check — returns true if credentials work. */
export async function ping(): Promise<boolean> {
  try {
    await apiFetch('/me')
    return true
  } catch {
    return false
  }
}
