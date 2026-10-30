import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Search,
  X,
  Check,
  CheckSquare,
  Square,
  Plus,
  Music,
  AlertCircle,
  CornerDownLeft,
} from 'lucide-react'
import type { SongEntity, WebSetlist } from '../types/gtar'

export interface MultiSongSetlistPickerProps {
  isOpen: boolean
  onClose: () => void
  currentSetlist: WebSetlist
  allSongs: SongEntity[]
  onAddSongs: (songsToAdd: SongEntity[]) => Promise<void> | void
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}

export const MultiSongSetlistPicker: React.FC<MultiSongSetlistPickerProps> = ({
  isOpen,
  onClose,
  currentSetlist,
  allSongs,
  onAddSongs,
  triggerRef,
}) => {
  const [queryChips, setQueryChips] = useState<string[]>([])
  const [inputValue, setInputValue] = useState<string>('')
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeHighlightIndex, setActiveHighlightIndex] = useState<number>(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)

  // Map for fast song lookup
  const songMap = useMemo(() => {
    const map = new Map<string, SongEntity>()
    for (const song of allSongs) {
      map.set(song.id, song)
    }
    return map
  }, [allSongs])

  // Map of occurrence counts in current setlist for duplicate disambiguation
  const setlistOccurrenceCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (currentSetlist?.songs) {
      for (const songRef of currentSetlist.songs) {
        counts.set(songRef.id, (counts.get(songRef.id) || 0) + 1)
      }
    }
    return counts
  }, [currentSetlist])

  // Filter songs by query chips and current input
  const filteredSongs = useMemo(() => {
    const activeTerms = [
      ...queryChips.map((c) => c.trim().toLowerCase()),
      ...(inputValue.trim() ? [inputValue.trim().toLowerCase()] : []),
    ]

    if (activeTerms.length === 0) {
      return allSongs
    }

    return allSongs.filter((song) => {
      const titleLower = song.title.toLowerCase()
      const artistLower = (song.artist || '').toLowerCase()
      const keyLower = (song.key || '').toLowerCase()
      const tags = Array.isArray(song.tags) ? song.tags.map((t) => t.toLowerCase()) : []

      // Match all query terms (each term must match title, artist, key, or tags)
      return activeTerms.every(
        (term) =>
          titleLower.includes(term) ||
          artistLower.includes(term) ||
          keyLower.includes(term) ||
          tags.some((t) => t.includes(term))
      )
    })
  }, [allSongs, queryChips, inputValue])

  // Selected song entities preserved in selection order
  const selectedSongsInOrder = useMemo(() => {
    return selectedSongIds
      .map((id) => songMap.get(id))
      .filter((s): s is SongEntity => Boolean(s))
  }, [selectedSongIds, songMap])

  // Auto-focus input when picker opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      setActiveHighlightIndex(-1)
      setErrorMessage(null)
    }
  }, [isOpen])

  // Add query chip
  const handleAddChip = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (!queryChips.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setQueryChips((prev) => [...prev, trimmed])
    }
    setInputValue('')
    setActiveHighlightIndex(-1)
  }

  // Remove query chip
  const handleRemoveChip = (indexToRemove: number) => {
    setQueryChips((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  // Toggle selection of a song
  const handleToggleSong = (songId: string) => {
    setSelectedSongIds((prev) => {
      if (prev.includes(songId)) {
        return prev.filter((id) => id !== songId)
      } else {
        return [...prev, songId]
      }
    })
  }

  // Remove selected song chip
  const handleRemoveSelectedSong = (songId: string) => {
    setSelectedSongIds((prev) => prev.filter((id) => id !== songId))
  }

  // Select all currently visible filtered songs
  const handleSelectAllFiltered = () => {
    setSelectedSongIds((prev) => {
      const next = [...prev]
      for (const song of filteredSongs) {
        if (!next.includes(song.id)) {
          next.push(song.id)
        }
      }
      return next
    })
  }

  // Deselect all
  const handleClearSelection = () => {
    setSelectedSongIds([])
  }

  // Confirm bulk add to setlist
  const handleAddSelected = async () => {
    if (selectedSongsInOrder.length === 0 || isSubmitting) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await onAddSongs(selectedSongsInOrder)
      // Reset state and close on success
      setSelectedSongIds([])
      setQueryChips([])
      setInputValue('')
      onClose()
      triggerRef?.current?.focus()
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to add songs to setlist.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Input keydown handler
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeHighlightIndex >= 0 && activeHighlightIndex < filteredSongs.length) {
        // Toggle highlighted song
        const song = filteredSongs[activeHighlightIndex]
        handleToggleSong(song.id)
      } else if (inputValue.trim()) {
        // Turn typed text into a query chip
        handleAddChip(inputValue)
      } else if (selectedSongIds.length > 0 && !isSubmitting) {
        // Add selected songs
        void handleAddSelected()
      }
    } else if (e.key === 'Backspace' && inputValue === '') {
      if (queryChips.length > 0) {
        // Remove last query chip
        handleRemoveChip(queryChips.length - 1)
      } else if (selectedSongIds.length > 0) {
        // Remove last selected song
        handleRemoveSelectedSong(selectedSongIds[selectedSongIds.length - 1])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveHighlightIndex((prev) => {
        const next = prev + 1
        return next < filteredSongs.length ? next : prev
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveHighlightIndex((prev) => {
        const next = prev - 1
        return next >= -1 ? next : -1
      })
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      triggerRef?.current?.focus()
    }
  }

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label="Multi-song search picker"
      className="bg-app-base border-2 border-app-action/40 rounded-2xl p-4 shadow-xl mb-6 space-y-3 transition-all animate-fadeIn"
    >
      {/* Header & Dismiss */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-app-border/70">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-app-action/20 text-app-action flex items-center justify-center">
            <Search className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-app-heading">Search Songs to Add</h3>
            <p className="text-[11px] text-app-muted">
              Add multiple local songs to <strong className="text-app-text">"{currentSetlist.name}"</strong> in one action
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-block text-[11px] text-app-muted bg-app-surface border border-app-border px-2 py-0.5 rounded font-mono">
            Esc to close
          </span>
          <button
            type="button"
            onClick={() => {
              onClose()
              triggerRef?.current?.focus()
            }}
            className="p-1.5 rounded-lg text-app-muted hover:text-app-heading hover:bg-app-surface transition-colors"
            title="Close picker (Esc)"
            aria-label="Close search picker"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Outlook-style Search Bar with Chips and Input */}
      <div className="space-y-1.5">
        <label htmlFor="multi-song-search-input" className="block text-xs font-semibold text-app-heading">
          Search local songbook (by title, artist, or musical key):
        </label>
        <div
          onClick={() => inputRef.current?.focus()}
          className="min-h-[46px] w-full bg-app-surface border border-app-border rounded-xl p-2 flex flex-wrap items-center gap-1.5 focus-within:border-app-accent focus-within:ring-2 focus-within:ring-app-accent/20 cursor-text transition-all"
        >
          {/* Query Filter Chips */}
          {queryChips.map((chip, idx) => (
            <span
              key={`query-chip-${idx}`}
              className="inline-flex items-center gap-1 bg-app-accent/20 border border-app-accent/40 text-app-text text-xs px-2 py-1 rounded-lg font-medium"
            >
              <span>{chip}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveChip(idx)
                }}
                className="hover:text-status-error text-app-muted transition-colors"
                aria-label={`Remove query filter ${chip}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* Selected Songs Chips in Input Header */}
          {selectedSongsInOrder.map((song) => (
            <span
              key={`selected-chip-${song.id}`}
              className="inline-flex items-center gap-1 bg-app-action/20 border border-app-action/40 text-app-action text-xs px-2 py-1 rounded-lg font-semibold"
            >
              <Music className="w-3 h-3" />
              <span className="max-w-[140px] truncate">{song.title}</span>
              {song.key && <span className="font-mono text-[10px] opacity-80">({song.key})</span>}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveSelectedSong(song.id)
                }}
                className="hover:text-status-error text-app-action/70 transition-colors ml-0.5"
                aria-label={`Deselect ${song.title}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {/* Active Search Text Input */}
          <input
            id="multi-song-search-input"
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              setActiveHighlightIndex(-1)
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={
              queryChips.length > 0 || selectedSongIds.length > 0
                ? 'Type to filter more, or press Enter to add filter chip...'
                : 'Type song title, artist, or key (Press Enter to add filter chip)...'
            }
            className="flex-1 min-w-[160px] bg-transparent text-xs text-app-text placeholder:text-app-muted/60 focus:outline-none py-1 px-1"
          />

          {inputValue.trim() && (
            <button
              type="button"
              onClick={() => handleAddChip(inputValue)}
              className="text-[11px] text-app-action hover:underline flex items-center gap-1 font-semibold px-1 py-0.5"
              title="Add as query chip (Enter)"
            >
              <span>+ Chip</span>
              <CornerDownLeft className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Controls Bar: Selection Count & Bulk Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
        <div className="flex items-center gap-3">
          <span
            aria-live="polite"
            className="font-medium text-app-heading flex items-center gap-1.5"
          >
            <span className="inline-block w-2 h-2 rounded-full bg-app-action" />
            <span>
              {selectedSongIds.length === 0
                ? '0 songs selected'
                : selectedSongIds.length === 1
                ? '1 song selected'
                : `${selectedSongIds.length} songs selected`}
            </span>
            <span className="text-app-muted">({filteredSongs.length} matching)</span>
          </span>

          {filteredSongs.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="text-app-action hover:underline font-semibold text-[11px]"
            >
              Select All Filtered
            </button>
          )}

          {selectedSongIds.length > 0 && (
            <button
              type="button"
              onClick={handleClearSelection}
              className="text-app-muted hover:text-status-error text-[11px]"
            >
              Clear Selection
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={handleAddSelected}
            disabled={selectedSongIds.length === 0 || isSubmitting}
            className="px-4 py-2 bg-app-action hover:brightness-110 disabled:opacity-40 text-app-on-action text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <span>Adding to setlist...</span>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>
                  {selectedSongIds.length === 0
                    ? 'Add Selected to Setlist'
                    : selectedSongIds.length === 1
                    ? 'Add 1 Selected Song'
                    : `Add ${selectedSongIds.length} Selected Songs`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error state */}
      {errorMessage && (
        <div className="p-2.5 bg-status-error/15 border border-status-error/30 rounded-xl text-status-error text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Search Results Panel */}
      <div
        ref={resultsContainerRef}
        role="listbox"
        aria-label="Available songs"
        className="max-h-72 overflow-y-auto space-y-1.5 pr-1 border border-app-border/50 bg-app-surface/60 rounded-xl p-2"
      >
        {allSongs.length === 0 ? (
          <div className="py-8 text-center text-app-muted text-xs">
            <Music className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="font-semibold">Your local songbook is empty.</p>
            <p className="text-[11px] mt-1">Import or create songs first in the Songbook tab.</p>
          </div>
        ) : filteredSongs.length === 0 ? (
          <div className="py-8 text-center text-app-muted text-xs">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="font-semibold">No songs match your search.</p>
            <p className="text-[11px] mt-1">
              Try searching by song title, artist, or musical key (e.g., "G", "Amazing", "Newton").
            </p>
          </div>
        ) : (
          filteredSongs.map((song, idx) => {
            const isSelected = selectedSongIds.includes(song.id)
            const occurrences = setlistOccurrenceCounts.get(song.id) || 0
            const isHighlighted = idx === activeHighlightIndex

            return (
              <div
                key={song.id}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => handleToggleSong(song.id)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault()
                    handleToggleSong(song.id)
                  }
                }}
                className={`w-full min-h-[44px] px-3 py-2 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors select-none ${
                  isSelected
                    ? 'bg-app-action/15 border-app-action/60 text-app-text'
                    : isHighlighted
                    ? 'bg-app-surface border-app-accent/50 text-app-text'
                    : 'bg-app-base hover:bg-app-surface border-app-border/60 text-app-text'
                }`}
              >
                {/* Checkbox and Song Metadata */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="text-app-action shrink-0 flex items-center justify-center">
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5 text-app-muted" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-app-heading text-xs truncate">
                        {song.title}
                      </span>
                      {occurrences > 0 && (
                        <span
                          className="shrink-0 text-[10px] bg-app-accent/15 text-app-accent border border-app-accent/30 rounded px-1.5 py-0.2 font-medium"
                          title={`Already in setlist ${occurrences} time(s)`}
                        >
                          In setlist{occurrences > 1 ? ` (×${occurrences})` : ''}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-app-muted flex items-center gap-2 mt-0.5">
                      <span className="truncate">{song.artist || 'Unknown Artist'}</span>
                      {song.key && (
                        <span className="font-mono text-app-accent shrink-0 font-semibold">
                          Key: {song.key}
                        </span>
                      )}
                      {song.bpm && (
                        <span className="shrink-0 opacity-75">
                          {song.bpm} BPM
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Selection status badge */}
                <div className="shrink-0">
                  {isSelected ? (
                    <span className="text-[11px] font-semibold text-app-action flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Selected</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-app-muted group-hover:text-app-heading">
                      Select
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
