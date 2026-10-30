import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Terminal, X, Copy, Share2, Download, Trash2 } from 'lucide-react'
import { diagnostics } from './runtime'

const buttonClass = 'min-h-[44px] min-w-[44px] rounded-xl border border-app-border bg-app-button px-3 py-2 text-xs font-semibold text-app-button-text focus-visible:outline-2 focus-visible:outline-app-action flex items-center justify-center gap-2'
const levels = ['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'] as const
const colors = { error: 'text-red-400 border-red-400/40 bg-red-400/10', warn: 'text-app-accent border-app-accent/40 bg-app-accent/10', info: 'text-app-action border-app-action/40 bg-app-action/10', debug: 'text-app-muted border-app-border bg-app-base' }

export default function DiagnosticsPanel() {
  if (!diagnostics) return null
  return <SessionPanel session={diagnostics} />
}

function SessionPanel({ session }: { session: NonNullable<typeof diagnostics> }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [filter, setFilter] = useState<typeof levels[number]>('ALL')
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const entries = useSyncExternalStore(session.subscribe, session.getSnapshot)

  useEffect(() => {
    const show = () => { opener.current = document.activeElement as HTMLElement; setStatus(''); setOpen(true) }
    const online = () => session.record('BROWSER_ONLINE')
    const offline = () => session.record('BROWSER_OFFLINE')
    window.addEventListener('gtar1:debug-logs', show)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('gtar1:debug-logs', show)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [session])

  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])

  const close = () => {
    setOpen(false)
    // The profile menu item unmounts on open; restore focus to the profile button.
    const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('[data-debug-logs-opener]')
    target?.focus()
  }

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
      setStatus('Download requested.')
    } catch {
      session.record('EXPORT_FAILED')
      setStatus('Download unavailable. Try Copy All.')
    } finally {
      anchor?.remove()
      if (url) { const revokeUrl = url; setTimeout(() => URL.revokeObjectURL(revokeUrl), 1000) }
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(session.exportLog(navigator.userAgent).text)
      setStatus('All logs copied.')
    } catch { setStatus('Copy unavailable. Try Download .log.') }
  }
  const share = async () => {
    try {
      const log = session.exportLog(navigator.userAgent)
      const file = new File([log.text], log.filename, { type: 'text/plain' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] })
      else await navigator.share({ title: 'GTAR1 Debug Logs', text: log.text })
      setStatus('Logs shared.')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('Share unavailable. Try Copy All or Download .log.')
    }
  }
  const visible = entries.filter(entry => filter === 'ALL' || entry.severity.toUpperCase() === filter)

  return <dialog ref={dialog} aria-labelledby="debug-logs-title" aria-describedby="debug-logs-retention" onCancel={event => { event.preventDefault(); close() }} onClose={close} onKeyDown={event => {
      if (event.key !== 'Tab') return
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'))
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}
    className="fixed inset-0 m-auto w-[calc(100%-1.5rem)] max-w-4xl max-h-[90dvh] rounded-2xl border border-app-border bg-app-surface p-0 text-app-text shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm">
    <div className="flex max-h-[90dvh] flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-app-border bg-app-base px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2"><Terminal className="h-5 w-5 text-app-action" /><h2 id="debug-logs-title" className="text-base font-bold text-app-heading">Debug Logs</h2><span className="rounded-full bg-app-surface px-2 py-1 text-xs text-app-muted">{entries.length}/20 events</span></div>
        <button autoFocus type="button" className={buttonClass} aria-label="Close Debug Logs" onClick={close}><X className="h-4 w-4" /></button>
      </header>
      <div className="shrink-0 space-y-3 border-b border-app-border px-4 py-3 sm:px-6">
        <div role="group" aria-label="Filter by severity" className="flex flex-wrap gap-1">
          {levels.map(level => <button key={level} type="button" aria-pressed={filter === level} onClick={() => setFilter(level)} className={`${buttonClass} ${filter === level ? '!bg-app-action !text-app-on-action' : ''}`}>{level}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => void copy()}><Copy className="h-4 w-4" />Copy All</button>
          {typeof navigator.share === 'function' && <button type="button" className={buttonClass} onClick={() => void share()}><Share2 className="h-4 w-4" />Share</button>}
          <button type="button" className={`${buttonClass} !bg-app-action !text-app-on-action`} onClick={download}><Download className="h-4 w-4" />Download .log</button>
          <button type="button" className={buttonClass} onClick={() => { session.clear(); setStatus('Logs cleared.') }}><Trash2 className="h-4 w-4" />Clear</button>
        </div>
        <p id="debug-logs-retention" className="text-xs text-app-muted">Last 20 events, kept in this tab only. Reload clears logs. No song content or automatic uploads.</p>
        <p role="status" className="text-xs text-app-muted">{status || `${visible.length} events shown`}</p>
      </div>
      <div className="min-h-0 overflow-y-auto bg-app-base p-4 sm:px-6">
        {visible.length === 0 && <p className="py-10 text-center text-sm text-app-muted">No {filter === 'ALL' ? '' : filter.toLowerCase() + ' '}events to show.</p>}
        <ol aria-label="Diagnostic entries" className="space-y-2 text-xs">
          {visible.map((entry, index) => <li key={`${entry.timestamp}-${index}`} className="rounded-xl border border-app-border bg-app-surface p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 font-mono"><time dateTime={entry.timestamp} className="text-app-muted">{entry.timestamp.replace('T', ' ')}</time><span className={`rounded border px-2 py-0.5 font-bold uppercase ${colors[entry.severity]}`}>{entry.severity}</span><span className="text-app-action">{entry.area}</span></div>
            <p className="break-words text-app-heading">{entry.message}</p><p className="mt-1 break-words font-mono text-app-muted">{entry.code}</p>
          </li>)}
        </ol>
      </div>
    </div>
  </dialog>
}
