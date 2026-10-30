import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'

export function SearchHelp({ children }: { children: string }) {
  const [open, setOpen] = useState(false)
  const pinned = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = () => { pinned.current = false; setOpen(false) }
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  return <div ref={root} className="relative shrink-0"
    onMouseEnter={() => setOpen(true)}
    onMouseLeave={() => { if (!pinned.current && !root.current?.contains(document.activeElement)) setOpen(false) }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { pinned.current = false; setOpen(false) } }}>
    <button type="button" aria-label="About online search" aria-describedby="global-online-help" aria-expanded={open}
      aria-controls="global-online-help" onFocus={() => setOpen(true)}
      onClick={() => { pinned.current = !pinned.current; setOpen(pinned.current) }}
      className="min-h-[44px] w-11 flex items-center justify-center rounded-xl header-neutral-icon hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-app-action">
      <Info className="w-4 h-4" />
    </button>
    <div id="global-online-help" role="tooltip" hidden={!open}
      className="absolute right-0 top-full z-10 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border border-app-border bg-app-surface p-3 text-xs text-app-text shadow-xl">
      {children}
    </div>
  </div>
}
