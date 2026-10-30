import { createRoot } from 'react-dom/client'
import DiagnosticsPanel from './DiagnosticsPanel'

// Separate root keeps diagnostics available when storage prevents App startup.
const host = document.createElement('div')
document.body.appendChild(host)
createRoot(host).render(<DiagnosticsPanel />)
