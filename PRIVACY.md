# GTAR1 Privacy Policy & Data Handling

GTAR1 is designed from the ground up as a **local-first, offline-capable progressive web application (PWA)** for musicians.

## Core Local Persistence & Isolation

1. **Local Storage**: All songs, setlists, folder structures, musician settings, and appearance presets are stored solely on your local device using browser `IndexedDB` (under the isolated namespace `gtar_revamp_local_v1`) and browser `localStorage`.
2. **Zero Cloud Database or Account Requirements**: There is no mandatory cloud backend, user registration, account login, tracking script, analytics beacon, or advertising telemetry in GTAR1.
3. **No Background Network Sync**: The core application initiates zero network requests during normal startup, chord viewing, editing, or setlist management once the PWA assets are cached.
4. **Local Backups**: All backup exports (`.json`) are generated entirely within your browser and saved directly to your local file system. Restoring a backup processes the file client-side without uploading data anywhere.

## Network Requests & Optional External Fonts

While GTAR1 operates completely offline with system fonts and built-in typography stacks (`Inter`, `JetBrains Mono`, `Fira Code`, `Georgia`):

- **Optional Custom HTTPS Fonts**: Users may choose to enter custom font URLs or Google Font families in the Palette Editor.
  - If (and only if) you deliberately configure and save a custom webfont URL or Google Fonts family, your browser will make a direct HTTPS request to that third-party font provider (e.g., `fonts.googleapis.com` or your custom stylesheet host) to retrieve the font face.
  - Font preview in the editor remains inert until explicitly saved by the user. Canceling or using built-in/system fonts makes zero external font requests.
  - Font stylesheet links request resources using `referrerpolicy="no-referrer"`.

## Future External Integrations (Planned / Non-Core)

Any future optional network features (e.g., optional cloud catalogs, QR code sharing, or Cast relays) will be isolated, opt-in capabilities that do not compromise the local-first security boundary of your local songbook.
