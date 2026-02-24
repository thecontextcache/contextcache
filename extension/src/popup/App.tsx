/**
 * Extension popup — shown when the user clicks the toolbar icon.
 *
 * Sections:
 *   1. Auth status (connected / not connected)
 *   2. API key input (if not set)
 *   3. Project selector (dropdown of user's projects)
 *   4. Quick-action buttons
 *   5. Settings (API base URL toggle: prod / localhost)
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  Brain,
  Check,
  ChevronDown,
  ExternalLink,
  Loader,
  LogOut,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react'
import { clearStoredAuth, getStoredAuth, saveStoredAuth } from '../utils/auth'

interface Project {
  id: number
  name: string
  org_id: number
}

type ViewState = 'loading' | 'unauthenticated' | 'authenticated'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-500'}`}
    />
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-800 rounded-xl p-4 ${className}`}>{children}</div>
  )
}

// ---------------------------------------------------------------------------
// Main Popup App
// ---------------------------------------------------------------------------

export default function App() {
  const [view, setView] = useState<ViewState>('loading')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [apiBase, setApiBase] = useState<'prod' | 'dev'>('prod')
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ---------------------------------------------------------------------------
  // Init — load stored credentials
  // ---------------------------------------------------------------------------

  const loadState = useCallback(async () => {
    setView('loading')
    setError(null)

    const stored = await getStoredAuth()

    if (!stored.apiKey) {
      setView('unauthenticated')
      return
    }

    setApiKey(stored.apiKey)
    setSelectedProjectId(stored.projectId)

    // Fetch projects from background
    const resp = await chrome.runtime.sendMessage({ type: 'GET_PROJECTS' })
    if (resp?.ok) {
      setProjects(resp.projects ?? [])
      setView('authenticated')
    } else {
      setError(resp?.error ?? 'Could not reach the API. Check your key and connection.')
      setView('unauthenticated')
    }
  }, [])

  useEffect(() => {
    loadState()
    // Load apiBase preference
    chrome.storage.local.get(['apiBaseUrl']).then((r) => {
      setApiBase(r.apiBaseUrl === 'http://localhost:8000' ? 'dev' : 'prod')
    })
  }, [loadState])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return
    setSaving(true)
    setError(null)
    try {
      await saveStoredAuth({ apiKey: apiKeyInput.trim() })
      setApiKeyInput('')
      await loadState()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleProjectChange = async (id: number) => {
    setSelectedProjectId(id)
    await saveStoredAuth({ projectId: id })
  }

  const handleSignOut = async () => {
    await clearStoredAuth()
    setApiKey('')
    setProjects([])
    setSelectedProjectId(null)
    setView('unauthenticated')
  }

  const handleApiBaseToggle = async (mode: 'prod' | 'dev') => {
    setApiBase(mode)
    const url = mode === 'dev' ? 'http://localhost:8000' : 'https://api.thecontextcache.com'
    await chrome.storage.local.set({ apiBaseUrl: url })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-[300px] bg-slate-900 text-slate-100 p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={20} className="text-teal-400" />
          <span className="font-semibold text-white tracking-tight">ContextCache</span>
        </div>
        <div className="flex items-center gap-2">
          {view === 'authenticated' && (
            <StatusDot ok={true} />
          )}
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <Card className="text-xs space-y-2">
          <p className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">API Server</p>
          <div className="flex gap-2">
            {(['prod', 'dev'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => handleApiBaseToggle(mode)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  apiBase === mode
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {mode === 'prod' ? 'Production' : 'Localhost :8000'}
              </button>
            ))}
          </div>
          <a
            href="https://app.thecontextcache.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-teal-400 hover:text-teal-300"
          >
            Open Web App <ExternalLink size={10} />
          </a>
        </Card>
      )}

      {/* Loading */}
      {view === 'loading' && (
        <div className="flex-1 flex items-center justify-center py-8">
          <Loader size={24} className="text-teal-400 animate-spin" />
        </div>
      )}

      {/* Unauthenticated */}
      {view === 'unauthenticated' && (
        <Card className="space-y-3">
          <p className="text-sm text-slate-300">
            Enter your{' '}
            <a
              href="https://app.thecontextcache.com"
              target="_blank"
              rel="noreferrer"
              className="text-teal-400 underline"
            >
              ContextCache API key
            </a>{' '}
            to get started.
          </p>
          {error && (
            <div className="text-xs text-red-400 bg-red-900/30 rounded-lg p-2">{error}</div>
          )}
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
            placeholder="cck_…"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            onClick={handleSaveKey}
            disabled={!apiKeyInput.trim() || saving}
            className="w-full bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
            Connect
          </button>
        </Card>
      )}

      {/* Authenticated */}
      {view === 'authenticated' && (
        <>
          {/* Project selector */}
          <Card className="space-y-2">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Active Project
            </p>
            {projects.length === 0 ? (
              <p className="text-xs text-slate-500">No projects found.</p>
            ) : (
              <div className="relative">
                <select
                  value={selectedProjectId ?? ''}
                  onChange={(e) => handleProjectChange(Number(e.target.value))}
                  className="w-full appearance-none bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8"
                >
                  <option value="" disabled>Select a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
              </div>
            )}
          </Card>

          {/* Quick status */}
          <Card className="flex items-center gap-3">
            <StatusDot ok={true} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-300 truncate">
                API Key: <span className="font-mono text-teal-400">{apiKey.slice(0, 12)}…</span>
              </p>
              <p className="text-xs text-slate-500">
                {selectedProjectId
                  ? `Project #${selectedProjectId}`
                  : 'No project selected'}
              </p>
            </div>
            <button
              onClick={loadState}
              className="text-slate-400 hover:text-white transition-colors p-1"
              title="Refresh"
            >
              <RefreshCw size={12} />
            </button>
          </Card>

          {/* Instructions */}
          <div className="text-xs text-slate-500 space-y-1 px-1">
            <p>• <strong className="text-slate-400">Highlight text</strong> → right-click → Save to ContextCache</p>
            <p>• On ChatGPT or Claude, click the <Brain size={10} className="inline" /> button to save the conversation</p>
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-red-400 transition-colors py-1"
          >
            <LogOut size={12} />
            Sign out / Change key
          </button>
        </>
      )}
    </div>
  )
}
