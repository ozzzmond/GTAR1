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
  FileText,
  ArrowLeft,
  Save,
  AlertTriangle,
  Upload,
  Copy,
  RefreshCw,
  Eye,
} from 'lucide-react'
import {
  type SongSource,
  CURATED_SONG_SOURCES,
  validateAndNormalizeWebsiteUrl,
  openExternalSongSource,
  loadCustomSongSources,
  saveCustomSongSources,
  getHostnameFallback,
  searchOnlineSongSource,
  getProviderForUrl,
  retrieveSongSource,
  parseImportedChordContent,
  type ParsedImportSong,
  type SourceProviderMetadata,
  MAX_IMPORT_BYTES,
} from '../utils/songSources'
import { useSongSourceProvider } from '../hooks/useSongSourceProvider'
import { SONG_SOURCE_PROVIDERS } from '../utils/songSourceProviders'
import { syncCanonicalDirectives } from '../utils/chordProMetadata'
import { parseChordProLine } from '../utils/songParser'
import { generateUUID } from '../utils/uuid'
import { saveSong } from '../utils/storage'
import type { SongEntity } from '../types/gtar'

export interface BrowseSongSourcesModalProps {
  isOpen: boolean
  onClose: () => void
  onSaveSong?: (song: SongEntity) => Promise<void> | void
  songs?: SongEntity[]
  onSelectSong?: (song: SongEntity) => void
  initialTab?: 'browse' | 'import'
  searchQuery?: string
}

const SAMPLE_CHORDPRO = `{title: Amazing Grace}
{artist: John Newton}
{key: G}
{tempo: 72}
{time: 3/4}

[Verse 1]
A[G]mazing grace! How [C]sweet the [G]sound
That saved a [D]wretch like me!
I [G]once was lost, but [C]now am [G]found;
Was blind, but [D]now I [G]see.`

export const BrowseSongSourcesModal: React.FC<BrowseSongSourcesModalProps> = ({
  isOpen,
  onClose,
  onSaveSong,
  songs = [],
  onSelectSong,
  initialTab = 'browse',
  searchQuery = '',
}) => {
  const { provider, selectProvider, preferenceNotice } = useSongSourceProvider()
  const [searchFeedback, setSearchFeedback] = useState<{ success: boolean; message: string } | null>(null)
  useEffect(() => { setSearchFeedback(null) }, [searchQuery, provider.id, isOpen])
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const [activeTab, setActiveTab] = useState<'browse' | 'import'>(initialTab)

  // Phase A - Browse Tab State
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

  // Phase B - Import & Preview Tab State
  const [importUrl, setImportUrl] = useState('')
  const [importUrlProvider, setImportUrlProvider] = useState<SourceProviderMetadata | null>(null)
  const [importUrlError, setImportUrlError] = useState<string | null>(null)
  const [isRetrieving, setIsRetrieving] = useState(false)

  const [rawText, setRawText] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [parsedPreview, setParsedPreview] = useState<ParsedImportSong | null>(null)
  const [previewViewMode, setPreviewViewMode] = useState<'rendered' | 'raw'>('rendered')

  // Editable Preview fields
  const [editTitle, setEditTitle] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const [editKey, setEditKey] = useState('')
  const [editCapo, setEditCapo] = useState('')
  const [editBpm, setEditBpm] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editYear, setEditYear] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Notification / Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const modalContentRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const update = () => setOnline(navigator.onLine !== false)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [isOpen])

  // Load custom shortcuts when modal opens
  useEffect(() => {
    if (isOpen) {
      setCustomSources(loadCustomSongSources())
      setDirectUrl('')
      setDirectUrlError(null)
      setShowForm(false)
      setEditingSourceId(null)
      setFormError(null)
      setActiveTab(initialTab)
      setImportUrl('')
      setImportUrlProvider(null)
      setImportUrlError(null)
      setRawText('')
      setInputError(null)
      setParsedPreview(null)
      setSaveError(null)
    }
  }, [isOpen, initialTab])

  // Update provider detection when importUrl changes
  useEffect(() => {
    const trimmed = importUrl.trim()
    if (!trimmed) {
      setImportUrlProvider(null)
      setImportUrlError(null)
      return
    }
    const check = validateAndNormalizeWebsiteUrl(trimmed)
    if (check.valid && check.url) {
      const provider = getProviderForUrl(check.url)
      setImportUrlProvider(provider)
      if (provider?.classification === 'RESTRICTED') {
        setImportUrlError(provider.restrictionReason)
      } else if (provider?.classification === 'UNSUPPORTED') {
        setImportUrlError(provider.restrictionReason)
      } else {
        setImportUrlError(null)
      }
    } else {
      setImportUrlProvider(null)
    }
  }, [importUrl])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showForm) {
          handleCancelForm()
        } else if (parsedPreview) {
          handleCancelPreview()
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, showForm, parsedPreview, onClose])

  // Scroll containment: Lock background body scrolling while modal is open
  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev))
    }, 3200)
  }

  // --- Phase A Handlers ---
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

  const handleOpenSource = (url: string) => {
    const res = openExternalSongSource(url)
    if (res.success) {
      showToast('Opening external source in new tab...')
    } else {
      showToast(res.error || 'Invalid URL')
    }
  }

  const handleStartAdd = () => {
    setEditingSourceId(null)
    setFormName('')
    setFormUrl('')
    setFormDesc('')
    setFormError(null)
    setShowForm(true)
  }

  const handleStartEdit = (source: SongSource) => {
    setEditingSourceId(source.id)
    setFormName(source.name)
    setFormUrl(source.url)
    setFormDesc(source.desc || '')
    setFormError(null)
    setShowForm(true)
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditingSourceId(null)
    setFormName('')
    setFormUrl('')
    setFormDesc('')
    setFormError(null)
  }

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

  const handleDeleteCustomSource = (id: string, name: string) => {
    const updated = customSources.filter((s) => s.id !== id)
    setCustomSources(updated)
    saveCustomSongSources(updated)
    if (editingSourceId === id) {
      handleCancelForm()
    }
    showToast(`Removed "${name}"`)
  }

  // --- Phase B Handlers ---
  const handleManualImport = () => {
    setImportUrl('')
    setActiveTab('import')
  }

  const handleUrlRetrieve = async (e: React.FormEvent) => {
    e.preventDefault()
    setImportUrlError(null)
    setInputError(null)
    setIsRetrieving(true)

    try {
      const result = await retrieveSongSource(importUrl)
      if (result.success && result.content) {
        setRawText(result.content)
        handleParseAndPreview(result.content, importUrl)
      } else {
        setImportUrlError(result.error || 'Failed to retrieve song source content.')
      }
    } catch (err: any) {
      setImportUrlError(err?.message || 'Network retrieval error')
    } finally {
      setIsRetrieving(false)
    }
  }

  const handleParseAndPreview = (contentToParse: string, sourceUrl?: string) => {
    setInputError(null)
    const res = parseImportedChordContent(contentToParse, { sourceUrl })
    if (res.success && res.song) {
      setParsedPreview(res.song)
      setEditTitle(res.song.title)
      setEditArtist(res.song.artist)
      setEditKey(res.song.key)
      setEditCapo(res.song.capo || '')
      setEditBpm(res.song.bpm || '')
      setEditTime(res.song.time || '')
      setEditYear(res.song.year || '')
      setSaveError(null)
    } else {
      setInputError(res.error || 'Failed to parse ChordPro content')
    }
  }

  const handlePasteClipboard = async () => {
    setInputError(null)
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText()
        if (text) {
          setRawText(text)
          showToast('Pasted from clipboard!')
        }
      } else {
        showToast('Clipboard access unavailable. Please paste directly into the box.')
      }
    } catch {
      showToast('Clipboard access denied. Please paste directly into the box.')
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_IMPORT_BYTES) {
      setInputError(`File size exceeds limit of ${Math.round(MAX_IMPORT_BYTES / 1024)} KB.`)
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (content) {
        setRawText(content)
        handleParseAndPreview(content)
        showToast(`Loaded ${file.name}`)
      }
    }
    reader.onerror = () => {
      setInputError('Failed to read selected file.')
    }
    reader.readAsText(file)
  }

  const handleCancelPreview = () => {
    setParsedPreview(null)
    setSaveError(null)
  }

  // Duplicate title check
  const duplicateSong = songs.find(
    (s) => s.title.trim().toLowerCase() === editTitle.trim().toLowerCase()
  )

  const handleSaveImportedSong = async () => {
    if (!parsedPreview || isSaving) return
    const cleanTitle = editTitle.trim()
    if (!cleanTitle) {
      setSaveError('Song title cannot be empty')
      return
    }

    if (duplicateSong) {
      setSaveError('A song with this title already exists. Choose Save as Copy or change the title.')
      return
    }
    const fields = [editTitle, editArtist, editKey, editCapo, editBpm, editTime, editYear]
    if (fields.some(field => field.length > 150 || /[\x00-\x1F\x7F{}]/.test(field))) {
      setSaveError('Metadata must be at most 150 characters and cannot contain controls or braces.')
      return
    }
    setIsSaving(true)
    setSaveError(null)

    try {
      // Sync canonical updates
      const syncedContent = syncCanonicalDirectives(parsedPreview.rawContent, {
        title: cleanTitle,
        artist: editArtist.trim() || undefined,
        key: editKey.trim() || undefined,
        tempo: editBpm.trim() || undefined,
        time: editTime.trim() || undefined,
        year: editYear.trim() || undefined,
      })

      const validated = parseImportedChordContent(syncedContent)
      if (!validated.success) throw new Error(validated.error || 'Invalid chart content')

      const newSongEntity: SongEntity = {
        id: generateUUID(),
        title: cleanTitle,
        artist: editArtist.trim() || undefined,
        key: editKey.trim() || undefined,
        originalKey: editKey.trim() || undefined,
        capo: editCapo.trim() || undefined,
        bpm: editBpm.trim() || undefined,
        time: editTime.trim() || undefined,
        year: editYear.trim() || undefined,
        tags: parsedPreview.tags,
        rawContent: syncedContent,
        format: parsedPreview.format,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      if (onSaveSong) {
        await onSaveSong(newSongEntity)
      } else {
        await saveSong(newSongEntity)
      }

      showToast(`Saved "${cleanTitle}" to local songbook!`)
      if (onSelectSong) {
        onSelectSong(newSongEntity)
      }
      // Reset state and close modal
      setParsedPreview(null)
      setRawText('')
      onClose()
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save song to local storage.')
    } finally {
      setIsSaving(false)
    }
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
        className="w-full max-w-4xl rounded-2xl bg-app-surface border border-app-border shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] animate-scale-in"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-app-border flex items-center justify-between bg-app-base/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-app-action/20 border border-app-action/30 flex items-center justify-center text-app-action shrink-0">
              {activeTab === 'browse' ? <Globe className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <h2
                id="browse-sources-modal-title"
                className="text-base font-bold text-app-heading leading-tight"
              >
                Browse Song Sources
              </h2>
              <p className="text-[11px] text-app-muted">
                {activeTab === 'browse'
                  ? 'External chord catalogs & custom website shortcuts'
                  : 'Safe ChordPro import preview & local songbook storage'}
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

        {/* Tab Navigation */}
        <div className="flex border-b border-app-border bg-app-base/40 px-5 pt-2 gap-2" role="tablist">
          <button
            type="button"
            role="tab"
            id="sources-tab-browse"
            aria-selected={activeTab === 'browse'}
            aria-controls="sources-tabpanel-browse"
            onClick={() => setActiveTab('browse')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-1.5 border-t border-x ${
              activeTab === 'browse'
                ? 'bg-app-surface border-app-border text-app-action -mb-[1px]'
                : 'border-transparent text-app-muted hover:text-app-heading'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Browse Websites</span>
          </button>
          <button
            type="button"
            role="tab"
            id="sources-tab-import"
            aria-selected={activeTab === 'import'}
            aria-controls="sources-tabpanel-import"
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-1.5 border-t border-x ${
              activeTab === 'import'
                ? 'bg-app-surface border-app-border text-app-action -mb-[1px]'
                : 'border-transparent text-app-muted hover:text-app-heading'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Import &amp; Preview</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain space-y-5 flex-1 text-app-text">
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

          {/* ==================== TAB 1: BROWSE WEBSITES ==================== */}
          {activeTab === 'browse' && (
            <div id="sources-tabpanel-browse" role="tabpanel" aria-labelledby="sources-tab-browse" className="space-y-5">
              <section aria-labelledby="public-search-heading" className="rounded-xl border border-app-border bg-app-base p-4 space-y-2">
                <h3 id="public-search-heading" className="text-sm font-bold text-app-heading">Online provider</h3>
                <label htmlFor="online-source-provider" className="sr-only">Provider</label>
                <select id="online-source-provider" value={provider.id} onChange={event => selectProvider(event.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-app-border bg-app-surface px-3 text-xs text-app-text focus-visible:outline-2 focus-visible:outline-app-action">
                  {SONG_SOURCE_PROVIDERS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <p className="text-xs text-app-muted">Search using the current header query. {provider.capabilities.externalSearch ? 'Results open on the provider website.' : 'Direct search link unavailable; opens its homepage instead.'}</p>
                <button type="button" onClick={() => setSearchFeedback(searchOnlineSongSource(provider.id, searchQuery))}
                  className="min-h-[44px] rounded-xl border border-app-border px-3 text-xs font-semibold text-app-action">
                  {provider.capabilities.externalSearch ? 'Search Online' : 'Open Website'}
                </button>
                {searchFeedback && <p role={searchFeedback.success ? 'status' : 'alert'} className="text-xs text-app-muted">{searchFeedback.message}</p>}
                <p className="text-xs text-app-muted">Import charts you own or have permission to use with <button type="button" onClick={() => setActiveTab('import')} className="underline text-app-action">Import &amp; Preview</button> to keep them local and available offline. Keep source and author attribution.</p>
                {!online && <p role="status" className="text-xs text-app-muted">You are offline. Local Songbook, Stage, and paste or file import remain available.</p>}
                {preferenceNotice && <p role="status" className="text-xs text-app-muted">{preferenceNotice}</p>}
              </section>
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
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={handleManualImport}
                            className="px-2 py-1 rounded-lg bg-app-surface hover:bg-app-base border border-app-border text-app-text font-medium transition-colors"
                            title={`Paste or upload a permitted chart from ${src.name}`}
                          >
                            Manual import
                          </button>
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              e.preventDefault()
                              handleOpenSource(src.url)
                            }}
                            className="px-2.5 py-1 rounded-lg bg-app-surface hover:bg-app-action hover:text-app-on-action border border-app-border text-app-link font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                            title={`Open ${src.name} in new tab`}
                            aria-label={`Open ${src.name} in new tab`}
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
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
          )}

          {/* ==================== TAB 2: IMPORT & PREVIEW ==================== */}
          {activeTab === 'import' && (
            <div id="sources-tabpanel-import" role="tabpanel" aria-labelledby="sources-tab-import" className="space-y-4">
              {!parsedPreview ? (
                /* Mode A: Input Form */
                <div className="space-y-4">
                  {/* URL Retrieval & Provider Status Check */}
                  <section aria-labelledby="url-retrieval-heading" className="p-3.5 rounded-xl bg-app-base border border-app-border space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span id="url-retrieval-heading" className="text-xs font-bold text-app-heading uppercase tracking-wide">
                        Online Source URL Retrieval
                      </span>
                      <span className="text-[10px] text-app-muted font-mono">
                        Policy &amp; CORS Check
                      </span>
                    </div>

                    <form onSubmit={handleUrlRetrieve} className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          id="import-source-url-input"
                          type="text"
                          value={importUrl}
                          onChange={(e) => setImportUrl(e.target.value)}
                          placeholder="e.g. https://www.ultimate-guitar.com/tabs/... or plain chord sheet URL"
                          className="flex-1 bg-app-surface border border-app-border rounded-xl px-3 py-2 text-xs text-app-heading placeholder-app-muted/60 focus:outline-none focus:border-app-action"
                        />
                        <button
                          type="submit"
                          disabled={isRetrieving || !importUrl.trim()}
                          className="px-3.5 py-2 min-h-[36px] bg-app-action hover:brightness-110 disabled:opacity-50 text-app-on-action font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                        >
                          {isRetrieving ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Globe className="w-3.5 h-3.5" />
                          )}
                          <span>Retrieve URL</span>
                        </button>
                      </div>

                      {/* Provider Warning / Status Banner */}
                      {importUrlProvider && (
                        <div
                          className={`p-3 rounded-xl border text-xs space-y-1.5 animate-fade-in ${
                            importUrlProvider.classification === 'RESTRICTED'
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                              : 'bg-app-base border-app-border text-app-muted'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                            <span>
                              {importUrlProvider.name}: Automated retrieval {importUrlProvider.classification.toLowerCase()}
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed">
                            {importUrlProvider.restrictionReason}
                          </p>
                          <div className="pt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenSource(importUrl)}
                              className="px-2.5 py-1 rounded-lg bg-app-surface hover:bg-app-action hover:text-app-on-action border border-app-border text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <span>Open {importUrlProvider.name} in new tab</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                            <span className="text-[10px] text-app-muted">
                              Copy chords from page and paste into the editor below.
                            </span>
                          </div>
                        </div>
                      )}

                      {importUrlError && !importUrlProvider && (
                        <div role="alert" className="text-[11px] text-red-400 font-medium flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{importUrlError}</span>
                        </div>
                      )}
                    </form>
                  </section>

                  {/* Direct Paste & File Upload Area */}
                  <section aria-labelledby="paste-chordpro-heading" className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label id="paste-chordpro-heading" htmlFor="import-raw-text-input" className="text-xs font-bold text-app-heading uppercase tracking-wide">
                        Paste ChordPro or Two-Line Chord Text
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handlePasteClipboard}
                          className="px-2.5 py-1 rounded-lg bg-app-base hover:bg-app-base/80 border border-app-border text-[11px] font-medium text-app-muted hover:text-app-heading flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Paste Clipboard</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1 rounded-lg bg-app-base hover:bg-app-base/80 border border-app-border text-[11px] font-medium text-app-muted hover:text-app-heading flex items-center gap-1 cursor-pointer"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Load File</span>
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".cho,.crd,.chopro,.chordpro,.txt"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </div>
                    </div>

                    <textarea
                      id="import-raw-text-input"
                      rows={9}
                      value={rawText}
                      onChange={(e) => {
                        setRawText(e.target.value)
                        if (inputError) setInputError(null)
                      }}
                      placeholder="{title: Song Title}&#10;{artist: Artist Name}&#10;{key: C}&#10;&#10;[C]Amazing [F]grace how [C]sweet the sound..."
                      className="w-full bg-app-base border border-app-border rounded-xl p-3 font-mono text-xs text-app-heading placeholder-app-muted/50 focus:outline-none focus:border-app-action leading-relaxed"
                    />

                    {inputError && (
                      <div role="alert" className="text-[11px] text-red-400 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{inputError}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRawText(SAMPLE_CHORDPRO)
                            if (inputError) setInputError(null)
                          }}
                          className="text-[11px] text-app-muted hover:text-app-action underline font-medium cursor-pointer"
                        >
                          Load Sample ChordPro
                        </button>
                        {rawText && (
                          <button
                            type="button"
                            onClick={() => {
                              setRawText('')
                              setInputError(null)
                            }}
                            className="text-[11px] text-app-muted hover:text-red-400 font-medium cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        id="btn-preview-chart"
                        disabled={!rawText.trim()}
                        onClick={() => handleParseAndPreview(rawText, importUrl || undefined)}
                        className="px-4 py-2 min-h-[36px] bg-app-action hover:brightness-110 disabled:opacity-50 text-app-on-action font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview Chart</span>
                      </button>
                    </div>
                  </section>
                </div>
              ) : (
                /* Mode B: Editable Preview State */
                <div className="space-y-4 animate-fade-in">
                  {/* Header Bar */}
                  <div className="flex items-center justify-between pb-2 border-b border-app-border">
                    <button
                      type="button"
                      onClick={handleCancelPreview}
                      className="px-2.5 py-1 rounded-lg bg-app-base hover:bg-app-surface text-app-muted hover:text-app-heading text-xs font-semibold flex items-center gap-1 cursor-pointer border border-app-border"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Input</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-app-accent/20 text-app-accent font-bold border border-app-accent/30">
                        {parsedPreview.format === 'CHORD_PRO' ? 'ChordPro' : 'Two-Line Text'}
                      </span>
                      <div className="flex rounded-lg border border-app-border bg-app-base p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setPreviewViewMode('rendered')}
                          className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                            previewViewMode === 'rendered'
                              ? 'bg-app-surface text-app-action font-bold'
                              : 'text-app-muted hover:text-app-heading'
                          }`}
                        >
                          Rendered Chart
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewViewMode('raw')}
                          className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                            previewViewMode === 'raw'
                              ? 'bg-app-surface text-app-action font-bold'
                              : 'text-app-muted hover:text-app-heading'
                          }`}
                        >
                          Raw ChordPro
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Duplicate Title Warning */}
                  {duplicateSong && (
                    <div
                      role="alert"
                      className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-start justify-between gap-3 animate-fade-in"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Duplicate Title Detected:</span>
                          <p className="text-[11px] text-amber-200/90 mt-0.5">
                            A song titled &ldquo;{editTitle}&rdquo; already exists. Choose Save as Copy or change the title before saving.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditTitle(`${editTitle.trim()} (Copy)`)}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-[11px] font-bold shrink-0 cursor-pointer"
                      >
                        Save as Copy
                      </button>
                    </div>
                  )}

                  {/* Editable Metadata Form */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-app-base border border-app-border text-xs">
                    <div className="col-span-2 space-y-1">
                      <label htmlFor="preview-title" className="text-[11px] font-semibold text-app-muted block">
                        Song Title (required)
                      </label>
                      <input
                        id="preview-title"
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full bg-app-surface border border-app-border rounded-lg px-2.5 py-1.5 text-xs text-app-heading focus:outline-none focus:border-app-action font-bold"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label htmlFor="preview-artist" className="text-[11px] font-semibold text-app-muted block">
                        Artist / Author
                      </label>
                      <input
                        id="preview-artist"
                        type="text"
                        value={editArtist}
                        onChange={(e) => setEditArtist(e.target.value)}
                        className="w-full bg-app-surface border border-app-border rounded-lg px-2.5 py-1.5 text-xs text-app-heading focus:outline-none focus:border-app-action"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="preview-key" className="text-[11px] font-semibold text-app-muted block">
                        Key
                      </label>
                      <input
                        id="preview-key"
                        type="text"
                        value={editKey}
                        onChange={(e) => setEditKey(e.target.value)}
                        placeholder="e.g. G"
                        className="w-full bg-app-surface border border-app-border rounded-lg px-2.5 py-1.5 text-xs text-app-heading focus:outline-none focus:border-app-action"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="preview-capo" className="text-[11px] font-semibold text-app-muted block">
                        Capo
                      </label>
                      <input
                        id="preview-capo"
                        type="text"
                        value={editCapo}
                        onChange={(e) => setEditCapo(e.target.value)}
                        placeholder="e.g. Capo 2"
                        className="w-full bg-app-surface border border-app-border rounded-lg px-2.5 py-1.5 text-xs text-app-heading focus:outline-none focus:border-app-action"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="preview-bpm" className="text-[11px] font-semibold text-app-muted block">
                        BPM / Tempo
                      </label>
                      <input
                        id="preview-bpm"
                        type="text"
                        value={editBpm}
                        onChange={(e) => setEditBpm(e.target.value)}
                        placeholder="e.g. 120"
                        className="w-full bg-app-surface border border-app-border rounded-lg px-2.5 py-1.5 text-xs text-app-heading focus:outline-none focus:border-app-action"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="preview-time" className="text-[11px] font-semibold text-app-muted block">
                        Time Signature
                      </label>
                      <input
                        id="preview-time"
                        type="text"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        placeholder="e.g. 4/4"
                        className="w-full bg-app-surface border border-app-border rounded-lg px-2.5 py-1.5 text-xs text-app-heading focus:outline-none focus:border-app-action"
                      />
                    </div>
                  </div>

                  {/* Chart Preview View */}
                  <div className="rounded-xl border border-app-border bg-app-base p-4 max-h-[280px] overflow-y-auto">
                    {previewViewMode === 'rendered' ? (
                      <div className="space-y-1.5 font-mono text-xs">
                        {parsedPreview.rawContent.split(/\r?\n/).map((line, idx) => {
                          const trimmed = line.trim()
                          if (!trimmed) {
                            return <div key={idx} className="h-3" />
                          }
                          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                            // Directive line
                            return (
                              <div key={idx} className="text-[10px] text-app-muted italic">
                                {trimmed}
                              </div>
                            )
                          }
                          const segments = parseChordProLine(line)
                          return (
                            <div key={idx} className="flex flex-wrap items-end leading-normal">
                              {segments.map((seg, sIdx) => (
                                <span key={sIdx} className="inline-flex flex-col mr-1">
                                  {seg.chord && (
                                    <span className="text-app-action font-bold text-xs leading-tight">
                                      {seg.chord}
                                    </span>
                                  )}
                                  <span className="text-app-heading">
                                    {seg.text || '\u00A0'}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <pre className="font-mono text-xs text-app-heading whitespace-pre-wrap leading-relaxed">
                        {syncCanonicalDirectives(parsedPreview.rawContent, {
                          title: editTitle.trim(),
                          artist: editArtist.trim() || undefined,
                          key: editKey.trim() || undefined,
                          tempo: editBpm.trim() || undefined,
                          time: editTime.trim() || undefined,
                          year: editYear.trim() || undefined,
                        })}
                      </pre>
                    )}
                  </div>

                  {saveError && (
                    <div role="alert" className="text-xs text-red-400 font-medium flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{saveError}</span>
                    </div>
                  )}

                  {/* Save Action Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-app-border">
                    <button
                      type="button"
                      onClick={handleCancelPreview}
                      className="ui-button px-3 py-1.5 rounded-xl bg-app-button border border-app-border text-xs font-semibold text-app-button-text hover:brightness-110 cursor-pointer"
                    >
                      Discard &amp; Re-edit
                    </button>

                    <button
                      type="button"
                      id="btn-save-to-songbook"
                      disabled={isSaving || !editTitle.trim()}
                      onClick={handleSaveImportedSong}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-md"
                    >
                      {isSaving ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      <span>Save to Local Songbook</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
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
