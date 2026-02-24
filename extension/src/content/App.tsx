/**
 * Content script React app — the floating Brain button and toast system.
 *
 * Renders:
 *   - A FAB (Floating Action Button) with the ContextCache brain icon.
 *   - A toast stack for success/error feedback.
 *
 * On click:
 *   - If on chatgpt.com → scrape conversation via chatgpt observer.
 *   - If on claude.ai   → scrape conversation via claude observer.
 *   - Otherwise         → save current page URL + selected text.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Brain, Check, Loader, X } from 'lucide-react'
import { scrapeChatGPT } from './observers/chatgpt'
import { scrapeClaude } from './observers/claude'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastType = 'success' | 'error' | 'loading'

interface Toast {
  id: number
  type: ToastType
  message: string
}

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const base =
    'pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium max-w-xs animate-slide-in'

  const styles: Record<ToastType, string> = {
    success: `${base} bg-brand-600 text-white`,
    error: `${base} bg-red-600 text-white`,
    loading: `${base} bg-gray-800 text-white`,
  }

  const icons: Record<ToastType, React.ReactNode> = {
    success: <Check size={16} />,
    error: <X size={16} />,
    loading: <Loader size={16} className="animate-spin" />,
  }

  useEffect(() => {
    if (toast.type === 'loading') return
    const timer = setTimeout(() => onDismiss(toast.id), 4000)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  return (
    <div className={styles[toast.type]}>
      {icons[toast.type]}
      <span>{toast.message}</span>
      {toast.type !== 'loading' && (
        <button
          onClick={() => onDismiss(toast.id)}
          className="ml-2 opacity-70 hover:opacity-100 transition-opacity"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

let toastCounter = 0

export default function App() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [busy, setBusy] = useState(false)

  const addToast = useCallback((type: ToastType, message: string): number => {
    const id = ++toastCounter
    setToasts((prev) => [...prev, { id, type, message }])
    return id
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const replaceToast = useCallback((id: number, type: ToastType, message: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, type, message } : t)))
    // Auto-dismiss after replacement
    setTimeout(() => removeToast(id), 4000)
  }, [removeToast])

  const handleCapture = useCallback(async () => {
    if (busy) return
    setBusy(true)

    const loadingId = addToast('loading', 'Sending to ContextCache…')

    try {
      const hostname = location.hostname

      let turns: Array<{ role: string; content: string }> | null = null
      let captureText = ''

      if (hostname.includes('chatgpt.com')) {
        turns = scrapeChatGPT()
        if (!turns.length) throw new Error('No conversation found on this page.')
        captureText = turns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join('\n\n')
      } else if (hostname.includes('claude.ai')) {
        turns = scrapeClaude()
        if (!turns.length) throw new Error('No conversation found on this page.')
        captureText = turns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join('\n\n')
      } else {
        // Generic capture — selected text or page meta
        const selected = window.getSelection()?.toString().trim() ?? ''
        captureText = selected || document.title
        if (!captureText) throw new Error('Nothing to capture. Select some text first.')
      }

      // Delegate the actual API call to the background service worker
      // (which has access to credentials and avoids CORS restrictions)
      const response = await chrome.runtime.sendMessage({
        type: 'INGEST_CONVERSATION',
        projectId: 0, // background will use stored project ID
        platform: location.hostname,
        turns: turns ?? [{ role: 'user', content: captureText }],
        url: location.href,
        title: document.title,
      })

      if (response?.ok) {
        replaceToast(loadingId, 'success', 'Saved! Check your Inbox to review.')
      } else {
        throw new Error(response?.error ?? 'Unknown error')
      }
    } catch (err) {
      replaceToast(
        loadingId,
        'error',
        err instanceof Error ? err.message : 'Failed — check your API key in the popup.',
      )
    } finally {
      setBusy(false)
    }
  }, [busy, addToast, replaceToast])

  return (
    // pointer-events-none on the root so the FAB doesn't block page clicks outside the button
    <div className="fixed bottom-0 right-0 p-4 flex flex-col items-end gap-2 pointer-events-none">
      {/* Toast stack — newest at top */}
      <div className="flex flex-col gap-2 items-end">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={handleCapture}
        disabled={busy}
        title="Save to ContextCache"
        className={[
          'pointer-events-auto',
          'w-14 h-14 rounded-full shadow-2xl',
          'bg-brand-600 hover:bg-brand-700 active:scale-95',
          'flex items-center justify-center',
          'transition-all duration-150',
          'border-2 border-brand-400',
          busy ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
          'animate-fade-in',
        ].join(' ')}
      >
        {busy ? (
          <Loader size={24} className="text-white animate-spin" />
        ) : (
          <Brain size={24} className="text-white" />
        )}
      </button>
    </div>
  )
}
