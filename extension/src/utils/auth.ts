/**
 * Auth utility — resolves the active credential for API calls.
 *
 * Priority order:
 *   1. API key manually set via the popup  (chrome.storage.local → 'apiKey')
 *   2. Session cookie from the web app     (cookie bridge via chrome.cookies)
 *   3. Nothing — returns null (user needs to authenticate)
 *
 * The cookie bridge works because:
 *   - manifest.json grants `cookies` permission + host_permissions for the web app
 *   - We read the session cookie that Next.js sets when the user logs in
 */

const WEB_APP_DOMAINS = [
  'https://app.thecontextcache.com',
  'http://localhost:3000',
]

const SESSION_COOKIE_NAME = 'contextcache_session'

export interface StoredAuth {
  apiKey: string | null
  projectId: number | null
}

/** Read what the user has saved in extension storage. */
export async function getStoredAuth(): Promise<StoredAuth> {
  const result = await chrome.storage.local.get(['apiKey', 'projectId'])
  return {
    apiKey: (result.apiKey as string | undefined) ?? null,
    projectId: (result.projectId as number | undefined) ?? null,
  }
}

/** Persist auth + selected project to extension storage. */
export async function saveStoredAuth(auth: Partial<StoredAuth>): Promise<void> {
  await chrome.storage.local.set(auth)
}

export async function clearStoredAuth(): Promise<void> {
  await chrome.storage.local.remove(['apiKey', 'projectId'])
}

/**
 * Returns the best available auth headers for an API call.
 * Returns null if no credential is available.
 */
export async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const { apiKey } = await getStoredAuth()

  if (apiKey) {
    return { 'X-API-Key': apiKey }
  }

  // Fall back to cookie bridge
  for (const domain of WEB_APP_DOMAINS) {
    try {
      const cookie = await chrome.cookies.get({ url: domain, name: SESSION_COOKIE_NAME })
      if (cookie?.value) {
        // The API accepts the session cookie as a bearer-style header.
        // The Next.js middleware on the web app strips and re-sets this.
        // For direct API calls from the extension we send it as a custom header
        // so the FastAPI middleware can read it from request.cookies.
        return { Cookie: `${SESSION_COOKIE_NAME}=${cookie.value}` }
      }
    } catch {
      // Chrome may throw if the domain isn't in host_permissions
    }
  }

  return null
}

/**
 * Listens for messages from the web app (externally_connectable).
 * The web app calls:
 *   chrome.runtime.sendMessage(EXTENSION_ID, { type: 'SET_API_KEY', apiKey, projectId })
 * This lets the extension auto-configure when the user is logged in.
 */
export function setupExternalMessageListener(): void {
  chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'SET_API_KEY' && typeof message.apiKey === 'string') {
      saveStoredAuth({
        apiKey: message.apiKey,
        projectId: message.projectId ?? null,
      }).then(() => sendResponse({ ok: true }))
      return true // keep channel open for async response
    }

    if (message?.type === 'CLEAR_AUTH') {
      clearStoredAuth().then(() => sendResponse({ ok: true }))
      return true
    }
  })
}
