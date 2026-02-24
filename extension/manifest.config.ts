import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'ContextCache',
  version: pkg.version,
  description: 'Save knowledge from any webpage to your ContextCache project memory.',

  permissions: [
    'contextMenus',
    'activeTab',
    'storage',
    'scripting',
    'cookies',
    'notifications',
  ],

  host_permissions: [
    '*://*.chatgpt.com/*',
    '*://*.claude.ai/*',
    'http://localhost:8000/*',
    'https://api.thecontextcache.com/*',
    // Needed for cookie-bridge auth
    'http://localhost:3000/*',
    'https://app.thecontextcache.com/*',
  ],

  // Allows the web app to push the API key / session to the extension
  // via chrome.runtime.sendMessage(extensionId, { type: 'SET_AUTH', ... })
  externally_connectable: {
    matches: [
      'http://localhost:3000/*',
      'https://app.thecontextcache.com/*',
    ],
  },

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.tsx'],
      // run_at: 'document_idle' is the default — waits for DOM to be ready
    },
  ],

  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'ContextCache',
    default_icon: {
      16: 'assets/icon16.png',
      32: 'assets/icon32.png',
      48: 'assets/icon48.png',
      128: 'assets/icon128.png',
    },
  },

  icons: {
    16: 'assets/icon16.png',
    32: 'assets/icon32.png',
    48: 'assets/icon48.png',
    128: 'assets/icon128.png',
  },
})
