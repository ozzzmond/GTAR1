import React, { useState, useEffect, useRef } from 'react'
import {
  Globe,
  ExternalLink,
  Plus,
  X,
  Music,
  Check,
  AlertCircle,
  Edit2,
  Trash2,
  ShieldCheck,
} from 'lucide-react'
import {
  type SongSource,
  CURATED_SONG_SOURCES,
  validateAndNormalizeWebsiteUrl,
  openExternalSongSource,
  loadCustomSongSources,
  saveCustomSongSources,
  getHostnameFallback,
} from '../utils/songSources'
import { generateUUID } from '../utils/uuid'

export interface BrowseSongSourcesModalProps {
  isOpen: boolean
  onClose: () => void
}

export const BrowseSongSourcesModal: React.FC<BrowseSongSourcesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [customSources, setCustomSources] = useState<SongSource[]>([])
  const [directUrl, setDirectUrl] = useState('')
  const [directUrlError, setDirectUrlError] = useState<string | null>(null)

  // Add / Edit custom source form state
  const [showForm, setShowForm] = useState(false)
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Notification / Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const modalContentRef = useRef<HTMLDivElement>(null)

  // Load custom shortcuts when modal opens
  useEffect(() => {
    if (isOpen) {
      setCustomSources(loadCustomSongSources())
      setDirectUrl('')
      setDirectUrlError(null)
      setShowForm(false)
      setEditingSourceId(null)
      setFormError(null)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showForm) {
          handleCancelForm()
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, showForm, onClose])

  if (!isOpen) return null

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev))
    }, 3200)
  }

  // Handle direct URL navigation
  const handleDirectOpen = (e: React.FormEvent) => {
    e.preventDefault()
    setDirectUrlError(null)
    const check = validateAndNormalizeWebsiteUrl(directUrl)
    if (!check.valid || !check.url) {
      setDirectUrlError(check.error || 'Please enter a valid website URL')
      return
    }

    const res = openExternalSongSource(check.url)
    if (res.success) {
      showToast('Opening external website in new tab...')
      setDirectUrl('')
    } else {
      setDirectUrlError(res.error || 'Failed to open URL')
    }
  }

  // Open any source item
  const handleOpenSource = (url: string) => {
    const res = openExternalSongSource(url)
    if (res.success) {
      showToast('Opening external source in new tab...')
    } else {
      showToast(res.error || 'Invalid URL')
    }
  }

  // Start adding a new custom source
  const handleStartAdd = () => {
    setEditingSourceId(null)
    setFormName('')
    setFormUrl('')
    setFormDesc('')
    setFormError(null)
    setShowForm(true)
  }

  // Start editing an existing custom source
  const handleStartEdit = (source: SongSource) => {
    setEditingSourceId(source.id)
    setFormName(source.name)
    setFormUrl(source.url)
    setFormDesc(source.desc || '')
    setFormError(null)
    setShowForm(true)
  }

  // Cancel add/edit form
  const handleCancelForm = () => {
    setShowForm(false)
    setEditingSourceId(null)
    setFormName('')
    setFormUrl('')
    setFormDesc('')
    setFormError(null)
  }

  // Save (add or update) custom source
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const check = validateAndNormalizeWebsiteUrl(formUrl)
    if (!check.valid || !check.url) {
      setFormError(check.error || 'Please enter a valid HTTP/HTTPS URL')
      return
    }

    const fallbackName = getHostnameFallback(check.url)
    const cleanName = formName.trim() || fallbackName
    const cleanDesc = formDesc.trim()

    let updatedList: SongSource[]

    if (editingSourceId) {
      // Update existing
      updatedList = customSources.map((s) => {
        if (s.id === editingSourceId) {
          return {
            ...s,
            name: cleanName,
            url: check.url!,
            desc: cleanDesc,
            updatedAt: Date.now(),
          }
        }
        return s
      })
      showToast('Custom shortcut updated!')
    } else {
      // Add new
      const newSource: SongSource = {
        id: generateUUID(),
        name: cleanName,
        url: check.url,
        desc: cleanDesc || 'Custom chord provider',
        isCurated: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      updatedList = [...customSources, newSource]
      showToast('Custom shortcut added!')
    }

    setCustomSources(updatedList)
    saveCustomSongSources(updatedList)
    handleCancelForm()
  }

  // Delete a custom source
  const handleDeleteCustomSource = (id: string, name: string) => {
    const updated = customSources.filter((s) => s.id !== id)
    setCustomSources(updated)
    saveCustomSongSources(updated)
    if (editingSourceId === id) {
      handleCancelForm()
    }
    showToast(`Removed "${name}"`)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="browse-sources-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={modalContentRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-app-surface border border-app-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-app-border flex items-center justify-between bg-app-base/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-app-action/20 border border-app-action/30 flex items-center justify-center text-app-action shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="browse-sources-modal-title"
                className="text-base font-bold text-app-heading leading-tight"
              >
                Browse Song Sources
              </h2>
              <p className="text-[11px] text-app-muted">
                External chord charts &amp; song lead sheets
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close browse song sources dialog"
            className="p-2 rounded-lg text-app-muted hover:text-app-heading hover:bg-app-base transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1 text-app-text">
          {/* Toast Notification */}
          {toastMessage && (
            <div
              role="status"
              className="px-3.5 py-2 rounded-xl bg-app-action/15 border border-app-action/40 text-app-action text-xs font-semibold flex items-center gap-2 animate-fade-in"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Section 1: Direct URL Entry */}
          <section aria-labelledby="direct-url-heading" className="space-y-2">
            <label
              id="direct-url-heading"
              htmlFor="direct-url-input"
              className="text-xs font-bold text-app-heading uppercase tracking-wide block"
            >
              Direct Website or Chart URL
            </label>
            <p className="text-[11px] text-app-muted">
              Enter any external chord sheet or song link to open it directly in a new tab.
            </p>
            <form onSubmit={handleDirectOpen} className="space-y-1.5">
              <div className="flex gap-2">
                <input
                  id="direct-url-input"
                  type="text"
                  value={directUrl}
                  onChange={(e) => {
                    setDirectUrl(e.target.value)
                    if (directUrlError) setDirectUrlError(null)
                  }}
                  placeholder="https://ultimate-guitar.com/tabs/... or chordie.com"
                  className="flex-1 bg-app-base border border-app-border rounded-xl px-3.5 py-2 text-xs text-app-heading placeholder-app-muted/60 focus:outline-none focus:border-app-action"
                  aria-invalid={directUrlError ? 'true' : 'false'}
                  aria-describedby={directUrlError ? 'direct-url-error' : undefined}
                />
                <button
                  type="submit"
                  className="px-4 py-2 min-h-[36px] bg-app-action hover:brightness-110 text-app-on-action font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open URL</span>
                </button>
              </div>
              {directUrlError && (
                <div
                  id="direct-url-error"
                  role="alert"
                  className="text-[11px] text-red-400 font-medium flex items-center gap-1 mt-1"
                >
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{directUrlError}</span>
                </div>
              )}
            </form>
          </section>

          {/* Section 2: Curated External Shortcuts */}
          <section aria-labelledby="curated-sources-heading" className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span
                id="curated-sources-heading"
                className="text-[11px] font-bold uppercase tracking-wider text-app-accent"
              >
                Curated Song Sources
              </span>
              <span className="text-[10px] text-app-muted font-medium">
                {CURATED_SONG_SOURCES.length} popular catalogs
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {CURATED_SONG_SOURCES.map((src) => (
                <div
                  key={src.id}
                  className="flex flex-col justify-between p-3 rounded-xl bg-app-base border border-app-border hover:border-app-action/60 transition-all group"
                >
                  <div className="flex items-start gap-2.5 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-app-surface border border-app-border flex items-center justify-center text-app-action shrink-0 mt-0.5">
                      <Music className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-app-heading group-hover:text-app-action transition-colors truncate">
                        {src.name}
                      </div>
                      <div className="text-[11px] text-app-muted line-clamp-2 leading-relaxed">
                        {src.desc}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-app-border/40 text-[10px]">
                    <span className="text-app-muted font-mono truncate mr-2">
                      {src.url.replace(/^https?:\/\//i, '')}
                    </span>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.preventDefault()
                        handleOpenSource(src.url)
                      }}
                      className="px-2.5 py-1 rounded-lg bg-app-surface hover:bg-app-action hover:text-app-on-action border border-app-border text-app-link font-semibold transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                      title={`Open ${src.name} in new tab`}
                      aria-label={`Open ${src.name} in new tab`}
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 3: Custom Website Shortcuts */}
          <section aria-labelledby="custom-sources-heading" className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span
                id="custom-sources-heading"
                className="text-[11px] font-bold uppercase tracking-wider text-app-accent"
              >
                Custom Source Shortcuts
              </span>
              <span className="text-[10px] text-app-muted font-mono">
                {customSources.length} {customSources.length === 1 ? 'shortcut' : 'shortcuts'} (Local Device)
              </span>
            </div>

            {/* Custom Sources List */}
            {customSources.length > 0 ? (
              <div className="space-y-2">
                {customSources.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-app-base border border-app-border hover:border-app-border/80 transition-colors group"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1 mr-2">
                      <div className="w-7 h-7 rounded-lg bg-app-surface border border-app-border flex items-center justify-center text-app-action shrink-0 mt-0.5">
                        <Globe className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-app-heading truncate">
                          {item.name}
                        </div>
                        {item.desc && (
                          <div className="text-[11px] text-app-muted truncate">
                            {item.desc}
                          </div>
                        )}
                        <div className="text-[10px] text-app-muted/70 font-mono truncate mt-0.5">
                          {item.url}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="p-1.5 rounded-lg text-app-muted hover:text-app-heading hover:bg-app-surface transition-colors cursor-pointer"
                        title={`Edit ${item.name}`}
                        aria-label={`Edit ${item.name}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomSource(item.id, item.name)}
                        className="p-1.5 rounded-lg text-app-muted hover:text-red-400 hover:bg-app-surface transition-colors cursor-pointer"
                        title={`Remove ${item.name}`}
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenSource(item.url)}
                        className="px-2.5 py-1 rounded-lg bg-app-surface hover:bg-app-action hover:text-app-on-action border border-app-border text-app-link font-semibold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                        title={`Open ${item.name} in new tab`}
                        aria-label={`Open ${item.name} in new tab`}
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 px-3 rounded-xl bg-app-base/40 border border-dashed border-app-border text-[11px] text-app-muted">
                No custom shortcuts yet. Add your favorite church, band, or chord websites below.
              </div>
            )}

            {/* Add / Edit Form */}
            {showForm ? (
              <form
                onSubmit={handleSaveForm}
                className="p-4 rounded-xl bg-app-base border border-app-action/40 space-y-3 animate-fade-in"
              >
                <div className="text-xs font-bold text-app-heading flex items-center justify-between">
                  <span>{editingSourceId ? 'Edit Custom Website Shortcut' : 'Add Custom Website Shortcut'}</span>
                  <span className="text-[10px] text-app-muted font-normal">Local Storage Only</span>
                </div>

                <div className="space-y-1">
                  <label htmlFor="custom-source-name" className="text-[11px] font-semibold text-app-muted block">
                    Source Name (optional)
                  </label>
                  <input
                    id="custom-source-name"
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. My Church Praise Charts"
                    className="w-full bg-app-surface border border-app-border rounded-lg px-3 py-1.5 text-xs text-app-heading placeholder-app-muted/60 focus:outline-none focus:border-app-action"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="custom-source-url" className="text-[11px] font-semibold text-app-muted block">
                    Website URL (required)
                  </label>
                  <input
                    id="custom-source-url"
                    type="text"
                    required
                    value={formUrl}
                    onChange={(e) => {
                      setFormUrl(e.target.value)
                      if (formError) setFormError(null)
                    }}
                    placeholder="https://example.com/chords"
                    className="w-full bg-app-surface border border-app-border rounded-lg px-3 py-1.5 text-xs text-app-heading placeholder-app-muted/60 focus:outline-none focus:border-app-action"
                    aria-invalid={formError ? 'true' : 'false'}
                    aria-describedby={formError ? 'form-url-error' : undefined}
                  />
                  {formError && (
                    <div id="form-url-error" role="alert" className="text-[11px] text-red-400 font-medium flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label htmlFor="custom-source-desc" className="text-[11px] font-semibold text-app-muted block">
                    Description (optional)
                  </label>
                  <input
                    id="custom-source-desc"
                    type="text"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="e.g. Worship team chord charts & lead sheets"
                    className="w-full bg-app-surface border border-app-border rounded-lg px-3 py-1.5 text-xs text-app-heading placeholder-app-muted/60 focus:outline-none focus:border-app-action"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCancelForm}
                    className="ui-button px-3 py-1.5 text-xs text-app-button-text bg-app-button hover:brightness-110 border border-app-border rounded-lg font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-app-action hover:brightness-110 text-app-on-action font-bold rounded-lg text-xs cursor-pointer shadow-sm transition-colors"
                  >
                    {editingSourceId ? 'Update Shortcut' : 'Save Shortcut'}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={handleStartAdd}
                className="w-full py-2.5 rounded-xl border border-dashed border-app-action/50 text-app-action text-xs font-bold hover:bg-app-action/10 transition-colors cursor-pointer flex items-center justify-center gap-2 min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>Add Custom Website Shortcut</span>
              </button>
            )}
          </section>

          {/* Privacy & Security Notice */}
          <div className="p-3 rounded-xl bg-app-base/60 border border-app-border text-[11px] text-app-muted flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-app-heading">External Navigation &amp; Privacy:</span>
              <p>
                Links open in a new tab with secure navigation flags (<code>noopener, noreferrer</code>).
                GTAR1 operates 100% offline and standalone; external websites are independent services and are not accessed by GTAR1 background engines.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-app-border bg-app-base/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="ui-button px-4 py-1.5 rounded-xl bg-app-button border border-app-border text-xs font-semibold text-app-button-text hover:brightness-110 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
