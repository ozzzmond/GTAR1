import React, { useState, useRef } from 'react'
import {
  type LocalUserProfile,
  getInitials,
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-app-surface border border-app-border rounded-2xl w-full max-w-md p-6 text-app-text shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close profile settings"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-app-muted hover:text-app-heading hover:bg-app-base transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-app-action/20 text-app-action flex items-center justify-center">
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

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-status-error/20 border border-status-error/40 text-status-error text-xs">
            {error}
          </div>
        )}

        <div className="space-y-4">
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
                  className="ui-button px-3 py-1.5 rounded-lg bg-app-button hover:brightness-110 text-app-button-text text-xs font-semibold flex items-center gap-1.5 transition-colors border border-app-border"
                >
                  <Camera className="w-3.5 h-3.5 text-app-action" />
                  <span>{avatar ? 'Change photo' : 'Upload photo'}</span>
                </button>
                {avatar && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="p-1.5 rounded-lg bg-app-surface hover:bg-status-error/20 text-app-muted hover:text-status-error text-xs transition-colors border border-app-border"
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

        <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-app-border">
          <button
            type="button"
            onClick={onClose}
            className="ui-button px-4 py-2 rounded-xl bg-app-button hover:brightness-110 text-app-button-text font-semibold text-xs transition-colors border border-app-border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={savedNotice}
            className="px-4 py-2 rounded-xl bg-app-action hover:brightness-110 text-app-on-action font-semibold text-xs transition-colors shadow-sm flex items-center gap-1.5"
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
