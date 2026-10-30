import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyThemeRuntime, hydrateThemeSettings } from './components/ThemeModal'

import { openRevampDB } from './utils/storage'

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
    document.getElementById('root')!.textContent = `Local storage unavailable: ${(error as Error).message}. Reload to retry recovery.`
  }
}
void start()
