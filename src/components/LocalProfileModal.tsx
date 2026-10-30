import React, { useState, useRef, useEffect } from 'react'
import {
  type LocalUserProfile,
  validateAvatarFile,
  saveLocalProfile,
  DEFAULT_AVATAR_PATH,
} from '../utils/localProfile'
import { Camera, Trash2, X, Check, User } from 'lucide-react'

export interface LocalProfileModalProps {
  profile: LocalUserProfile
  onSaveProfile: (profile: LocalUserProfile) => void
  onClose: () => void
}

export const LocalProfileModal: React.FC<LocalProfileModalProps> = ({
  profile,
  onSaveProfile,
  onClose,
}) => {
  const [name, setName] = useState(profile.displayName)
  const [avatar, setAvatar] = useState<string | undefined>(profile.avatarBase64)
  const [error, setError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Scroll containment: Lock background body scrolling while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  // Keyboard accessibility: Escape dismissal
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [onClose])

  // Focus trap on Tab navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateAvatarFile(file)
    if (!validation.valid) {
      setError(validation.error || 'Invalid image file')
      return
    }

    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setAvatar(result)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveAvatar = () => {
    setAvatar(undefined)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSave = () => {
    const trimmed = name.trim() || 'Musician'
    const updated: LocalUserProfile = {
      displayName: trimmed,
      avatarBase64: avatar,
      updatedAt: Date.now(),
    }
    saveLocalProfile(updated)
    onSaveProfile(updated)
    setSavedNotice(true)
    setTimeout(() => {
      onClose()
    }, 400)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-profile-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onKeyDown={handleKeyDown}
        className="bg-app-surface border border-app-border rounded-2xl w-full max-w-md max-h-[90dvh] flex flex-col text-app-text shadow-2xl relative overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pinned Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-app-border bg-app-base shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-app-action/20 text-app-action flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 id="local-profile-title" className="text-base font-bold text-app-heading">
                Local Musician Profile
              </h2>
              <p className="text-[11px] text-app-muted">
                Offline identity for chord charts and stage presentation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile settings"
            className="p-1.5 rounded-lg text-app-muted hover:text-app-heading hover:bg-app-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body with overscroll containment */}
        <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain flex-1 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-status-error/20 border border-status-error/40 text-status-error text-xs">
              {error}
            </div>
          )}

          {/* Avatar Preview & Upload */}
          <div className="flex items-center gap-4 p-3 rounded-xl bg-app-base border border-app-border">
            <div className="relative group shrink-0">
              <img
                src={avatar || DEFAULT_AVATAR_PATH}
                alt={name}
                className="w-16 h-16 rounded-full object-cover border-2 border-app-accent shadow-md"
              />
            </div>

            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  id="avatar-file-input"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="ui-button px-3 py-1.5 rounded-lg bg-app-button hover:brightness-110 text-app-button-text text-xs font-semibold flex items-center gap-1.5 transition-colors border border-app-border cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-app-action" />
                  <span>{avatar ? 'Change photo' : 'Upload photo'}</span>
                </button>
                {avatar && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="p-1.5 rounded-lg bg-app-surface hover:bg-status-error/20 text-app-muted hover:text-status-error text-xs transition-colors border border-app-border cursor-pointer"
                    title="Remove avatar"
                    aria-label="Remove avatar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-app-muted">
                Max 2MB. JPG, PNG, WEBP, or GIF. Stored locally on this device only.
              </p>
            </div>
          </div>

          {/* Display Name Input */}
          <div>
            <label htmlFor="profile-display-name" className="block text-xs font-semibold text-app-heading mb-1.5">
              Display Name
            </label>
            <input
              id="profile-display-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lead Guitarist"
              maxLength={40}
              className="w-full px-3 py-2 rounded-xl bg-app-base border border-app-border text-app-text text-sm focus:outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent"
            />
          </div>

          <div className="p-3 rounded-xl bg-app-base border border-app-border text-[11px] text-app-muted space-y-1">
            <div className="font-semibold text-app-heading flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-status-success inline-block"></span>
              Local Offline Profile Guarantee
            </div>
            <p>
              GTAR1 operates completely offline without cloud dependencies, Google logins, or telemetry. Your profile remains exclusively inside your device's browser sandbox.
            </p>
          </div>
        </div>

        {/* Pinned Footer */}
        <div className="flex items-center justify-end gap-2.5 p-4 sm:p-5 border-t border-app-border bg-app-base shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="ui-button px-4 py-2 rounded-xl bg-app-button hover:brightness-110 text-app-button-text font-semibold text-xs transition-colors border border-app-border cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={savedNotice}
            className="px-4 py-2 rounded-xl bg-app-action hover:brightness-110 text-app-on-action font-semibold text-xs transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            {savedNotice ? (
              <>
                <Check className="w-3.5 h-3.5 text-current" />
                <span>Saved!</span>
              </>
            ) : (
              <span>Save Profile</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
