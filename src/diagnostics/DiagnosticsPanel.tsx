import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { diagnostics } from './runtime'

const buttonClass = 'min-h-[44px] min-w-[44px] rounded-lg border border-app-border bg-app-button px-3 py-2 text-app-button-text focus-visible:outline-2'

export default function DiagnosticsPanel() {
  if (!diagnostics) return null
  return <SessionPanel session={diagnostics} />
}

function SessionPanel({ session }: { session: NonNullable<typeof diagnostics> }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const opener = useRef<HTMLButtonElement>(null)
  const entries = useSyncExternalStore(session.subscribe, session.getSnapshot)

  useEffect(() => {
    const online = () => session.record('BROWSER_ONLINE')
    const offline = () => session.record('BROWSER_OFFLINE')
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [session])

  const download = () => {
    let url: string | undefined
    let anchor: HTMLAnchorElement | undefined
    try {
      const log = session.exportLog(navigator.userAgent)
      url = URL.createObjectURL(new Blob([log.text], { type: 'text/plain;charset=utf-8' }))
      anchor = document.createElement('a')
      anchor.href = url
      anchor.download = log.filename
      document.body.appendChild(anchor)
      anchor.click()
      setStatus('Local download requested. No upload occurs.')
    } catch {
      session.record('EXPORT_FAILED')
      setStatus('Download unavailable. Check browser download support.')
    } finally {
      anchor?.remove()
      if (url) {
        const revokeUrl = url
        setTimeout(() => URL.revokeObjectURL(revokeUrl), 1000)
      }
    }
  }

  return <aside aria-label="DEV diagnostics" className="fixed bottom-2 right-2 z-[100] max-w-[calc(100vw-1rem)] rounded-xl border border-app-border bg-app-surface p-2 text-app-text shadow-xl">
    <button ref={opener} type="button" className={buttonClass} aria-expanded={open} aria-controls="dev-diagnostics-panel" onClick={() => setOpen(!open)}>DEV diagnostics</button>
    {open && <section id="dev-diagnostics-panel" aria-label="Diagnostic log" className="w-[34rem] max-w-full max-h-[65dvh] overflow-y-auto p-2 space-y-3" onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); opener.current?.focus(); event.stopPropagation() } }}>
      <p className="text-sm">Memory only: last 20 fixed events in this tab. Reload clears logs. No song data, error text, console capture, or telemetry.</p>
      <p className="text-sm">Browser profile is an estimate, not verified identity. Export is a local plain-text file.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} onClick={download}>Export logs</button>
        <button type="button" className={buttonClass} onClick={() => { session.clear(); setStatus('Logs cleared.') }}>Clear logs</button>
      </div>
      <p role="status" className="text-sm">{status || `${entries.length}/20 entries`}</p>
      <ol aria-label="Diagnostic entries" className="space-y-2 text-xs font-mono break-words">
        {entries.map((entry, index) => <li key={`${entry.timestamp}-${index}`}>
          <time>{entry.timestamp}</time> | {entry.severity} | {entry.area} | {entry.code}<br />{entry.message}
        </li>)}
      </ol>
    </section>}
  </aside>
}
