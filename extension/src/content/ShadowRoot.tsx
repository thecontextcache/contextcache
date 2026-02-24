/**
 * ShadowRoot wrapper — mounts React children inside an isolated Shadow DOM.
 *
 * Why Shadow DOM?
 *   ChatGPT, Claude, and other SPAs ship aggressive global CSS that will
 *   break our Tailwind classes if we inject into the regular DOM.
 *   Shadow DOM creates a hard CSS boundary — host page styles can't penetrate
 *   in, and our Tailwind won't pollute the host page out.
 *
 * How it works:
 *   1. A <div id="contextcache-host"> is attached to document.body.
 *   2. We call attachShadow({ mode: 'open' }) on it.
 *   3. We inject our compiled Tailwind CSS into a <style> tag inside the shadow root.
 *   4. We createPortal the React tree into a mount point inside the shadow root.
 */
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
// The ?inline suffix tells Vite to import the CSS as a plain string —
// CRXJS will NOT inject this globally; we inject it manually into the shadow root.
import tailwindStyles from './content.css?inline'

interface ShadowRootWrapperProps {
  children: React.ReactNode
}

export function ShadowRootWrapper({ children }: ShadowRootWrapperProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [mountPoint, setMountPoint] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Attach shadow once — React StrictMode may run this twice in dev,
    // so guard against re-attaching.
    if (host.shadowRoot) {
      const existing = host.shadowRoot.querySelector<HTMLDivElement>(
        '#contextcache-mount',
      )
      if (existing) {
        setMountPoint(existing)
        return
      }
    }

    const shadow = host.attachShadow({ mode: 'open' })

    // Inject compiled Tailwind CSS into the shadow root
    const style = document.createElement('style')
    style.textContent = tailwindStyles
    shadow.appendChild(style)

    // The actual React mount target inside the shadow
    const mount = document.createElement('div')
    mount.id = 'contextcache-mount'
    mount.style.cssText = 'position:fixed;bottom:0;right:0;z-index:2147483647;pointer-events:none;'
    shadow.appendChild(mount)

    setMountPoint(mount)
  }, [])

  return (
    // This div lives in the normal DOM but contains no visible content —
    // everything is rendered inside the shadow root via the portal.
    <div ref={hostRef} id="contextcache-shadow-host" style={{ all: 'unset' }}>
      {mountPoint && createPortal(children, mountPoint)}
    </div>
  )
}
