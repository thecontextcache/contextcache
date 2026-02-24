/**
 * Background Service Worker (Manifest V3).
 *
 * Responsibilities:
 *   1. Create the "Save to ContextCache" context menu item on install.
 *   2. Handle context menu clicks — read selected text + URL, call /ingest/raw.
 *   3. Listen for messages from content scripts (conversation captures).
 *   4. Listen for external messages from the web app (auth push).
 */
import { getAuthHeaders, getStoredAuth, setupExternalMessageListener } from '../utils/auth'
import { ingestRaw, listProjects } from '../utils/api'

const CONTEXT_MENU_ID = 'contextcache-save'

// ---------------------------------------------------------------------------
// Install / Startup
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Save to ContextCache',
    // Only show when text is selected
    contexts: ['selection'],
  })

  console.log('[ContextCache] Extension installed. Context menu registered.')
})

// ---------------------------------------------------------------------------
// Context Menu — right-click "Save to ContextCache"
// ---------------------------------------------------------------------------

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return

  const selectedText = info.selectionText?.trim() ?? ''
  const pageUrl = info.pageUrl ?? tab?.url ?? ''
  const pageTitle = tab?.title ?? ''

  if (!selectedText) return

  try {
    const { projectId } = await getStoredAuth()

    if (!projectId) {
      notifyError('No project selected. Open the ContextCache popup to choose one.')
      return
    }

    await ingestRaw({
      source: 'chrome_ext',
      project_id: projectId,
      payload: {
        text: selectedText,
        url: pageUrl,
        title: pageTitle,
      },
    })

    notifySuccess(`Saved "${selectedText.slice(0, 60)}${selectedText.length > 60 ? '…' : ''}"`)
  } catch (err) {
    console.error('[ContextCache] Context menu save failed:', err)
    notifyError(err instanceof Error ? err.message : 'Failed to save. Check your API key.')
  }
})

// ---------------------------------------------------------------------------
// Messages from content scripts
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'INGEST_CONVERSATION') {
    handleConversationIngest(message)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
    return true // keep port open for async
  }

  if (message?.type === 'GET_PROJECTS') {
    listProjects()
      .then((projects) => sendResponse({ ok: true, projects }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
    return true
  }

  if (message?.type === 'PING_AUTH') {
    getAuthHeaders()
      .then((headers) => sendResponse({ ok: true, authed: headers !== null }))
      .catch(() => sendResponse({ ok: true, authed: false }))
    return true
  }
})

// ---------------------------------------------------------------------------
// External messages from the web app
// ---------------------------------------------------------------------------

setupExternalMessageListener()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function handleConversationIngest(message: {
  projectId: number
  platform: string
  turns: Array<{ role: string; content: string }>
  url: string
  title: string
}): Promise<{ capture_id: number }> {
  const { projectId } = await getStoredAuth()
  const targetProject = message.projectId || projectId

  if (!targetProject) {
    throw new Error('No project selected. Open the popup to choose one.')
  }

  const fullText = message.turns
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join('\n\n')

  const result = await ingestRaw({
    source: 'chrome_ext',
    project_id: targetProject,
    payload: {
      text: fullText,
      url: message.url,
      title: message.title,
      platform: message.platform,
      conversation: message.turns as Array<{ role: 'user' | 'assistant'; content: string }>,
    },
  })

  notifySuccess(`Conversation saved to project #${targetProject} — check your Inbox!`)
  return result
}

function notifySuccess(message: string): void {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'assets/icon48.png',
    title: 'ContextCache',
    message,
    priority: 1,
  })
}

function notifyError(message: string): void {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'assets/icon48.png',
    title: 'ContextCache — Error',
    message,
    priority: 2,
  })
}
