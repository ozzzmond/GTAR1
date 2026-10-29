import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyThemeRuntime, hydrateThemeSettings } from './components/ThemeModal'

// Pre-render hydration: apply saved or default theme before React mount to prevent cold start flash
const initialTheme = hydrateThemeSettings()
applyThemeRuntime(initialTheme.mode, initialTheme.standalone)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
