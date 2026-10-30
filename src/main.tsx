import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyThemeRuntime, hydrateThemeSettings } from './components/ThemeModal'

import { openRevampDB } from './utils/storage'
import { recordDiagnostic } from './diagnostics/runtime'

if (import.meta.env.GTAR1_DEV_DIAGNOSTICS) {
  recordDiagnostic('SESSION_STARTED')
  void import('./diagnostics/mount')
}

// Recover an interrupted settings restore before any component reads appearance.
async function start() {
  try {
    await openRevampDB()
    const initialTheme = hydrateThemeSettings()
    applyThemeRuntime(initialTheme.mode, initialTheme.standalone)
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
      <React.StrictMode><App /></React.StrictMode>
    )
  } catch (error) {
    recordDiagnostic('INITIAL_LOAD_FAILED')
    document.getElementById('root')!.textContent = `Local storage unavailable: ${(error as Error).message}. Reload to retry recovery.`
    if (import.meta.env.GTAR1_DEV_DIAGNOSTICS) {
      const button = document.createElement('button')
      button.textContent = 'Debug Logs'
      button.dataset.debugLogsOpener = ''
      button.className = 'm-4 min-h-[44px] rounded-xl border px-4'
      button.onclick = () => window.dispatchEvent(new Event('gtar1:debug-logs'))
      document.getElementById('root')!.appendChild(button)
    }
  }
}
void start()
