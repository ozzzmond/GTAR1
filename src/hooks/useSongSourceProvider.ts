import { useEffect, useState } from 'react'
import { loadSongSourceProvider, saveSongSourceProvider, SONG_SOURCE_PROVIDER_KEY } from '../utils/songSources'
import { resolveSongSourceProvider } from '../utils/songSourceProviders'

const PROVIDER_CHANGED = 'gtar1:song-source-provider'

// Share the optional website preference between the header and Sources dialog.
export function useSongSourceProvider() {
  const [providerId, setProviderId] = useState(loadSongSourceProvider)
  const [preferenceNotice, setPreferenceNotice] = useState('')
  useEffect(() => {
    const changed = (event: Event) => setProviderId(resolveSongSourceProvider((event as CustomEvent).detail).id)
    const stored = (event: StorageEvent) => {
      if (event.key === SONG_SOURCE_PROVIDER_KEY || event.key === null) setProviderId(loadSongSourceProvider())
    }
    window.addEventListener(PROVIDER_CHANGED, changed)
    window.addEventListener('storage', stored)
    return () => {
      window.removeEventListener(PROVIDER_CHANGED, changed)
      window.removeEventListener('storage', stored)
    }
  }, [])
  const selectProvider = (id: string) => {
    const safeId = resolveSongSourceProvider(id).id
    setProviderId(safeId)
    setPreferenceNotice(saveSongSourceProvider(safeId) ? '' : 'Provider changed for this visit. Browser storage is unavailable.')
    window.dispatchEvent(new window.CustomEvent(PROVIDER_CHANGED, { detail: safeId }))
  }
  return { provider: resolveSongSourceProvider(providerId), selectProvider, preferenceNotice }
}
