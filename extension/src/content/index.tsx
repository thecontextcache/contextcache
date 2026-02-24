/**
 * Content script entry point.
 *
 * Injected into every page by the browser (see manifest.config.ts content_scripts).
 * Creates the Shadow DOM host, mounts the React app inside it.
 *
 * The ?inline import gives us the compiled Tailwind CSS as a string —
 * ShadowRootWrapper injects it into the shadow root so it's isolated
 * from the host page.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ShadowRootWrapper } from './ShadowRoot'
import App from './App'

// Prevent double-mounting (e.g. on SPA route changes that re-run scripts)
const HOST_ID = 'contextcache-extension-root'
if (!document.getElementById(HOST_ID)) {
  const host = document.createElement('div')
  host.id = HOST_ID
  // Position the host in the normal DOM stacking context
  host.style.cssText = [
    'position: fixed',
    'bottom: 0',
    'right: 0',
    'z-index: 2147483647', // max z-index
    'pointer-events: none',
    'width: 0',
    'height: 0',
  ].join(';')

  document.body.appendChild(host)

  const root = createRoot(host)
  root.render(
    <React.StrictMode>
      <ShadowRootWrapper>
        <App />
      </ShadowRootWrapper>
    </React.StrictMode>,
  )
}
