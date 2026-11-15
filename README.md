# GTAR1

**Simple. Stage. Companion.**

GTAR1 is a local-first music Web/PWA for musicians, bands, and worship teams. Keep a songbook, edit ChordPro charts, arrange setlists, and read lyrics and chords on stage.

**[Open GTAR1's Interactive Demo](https://demo.gtar1.pages.dev/)**

The demo includes sample songs and resets after 15 minutes of inactivity, when its sample content changes, or when you choose **Reset demo**. Export anything you want to keep.

## Core Features

- **Songbook** — Create, edit, search, and organize songs with tags and setlist membership.
- **ChordPro Editor** — Edit chord charts with a live stage preview, transposition, and structured song sections.
- **Setlist Manager** — Create and name setlists, add songs, and arrange their performance order.
- **Stage View** — Display lyrics and chords with song navigation, scrolling, font and layout controls, and fullscreen options.
- **Advanced Tools** — A modular home for optional tools and integrations. The current app groups tools here; the broader extension system is planned, and some integration entries are placeholders.
- **Local-First & Offline PWA** — Store the songbook on your device and use cached app resources offline after an initial online load. Installation is available in supported browsers.
- **Backup & Restore** — Export, import, and restore supported songbook and setlist data through the Backup & Restore center, including JSON backups.

## Local-first and PWA usage

The core songbook works without signing in. Songs and setlists are stored in the browser's IndexedDB database; display preferences use local browser storage. Data belongs to the browser profile and site origin where you use the app.

Open the app online first so its service worker can cache the application. Use your browser's install or **Add to Home Screen** option where supported. Saved charts and local editing can then work offline; online sources and account services still require a connection and any applicable setup.

Browser storage can be cleared or evicted. Export backups regularly, especially before clearing site data or changing devices. The interactive demo resets its library and is intended for trying the app.

## Getting Started

The app lives in [`web/`](web/). It uses React, TypeScript, Vite, and Tailwind CSS, with IndexedDB for the device library. Optional server features use Cloudflare Pages Functions and D1.

Use Node.js 22 and npm. From the repository root:

```bash
cd web
npm ci
npm run dev
```

Open `http://localhost:5173`. This starts the frontend for local songbook use; it does not start the API.

For local API development on Windows, run `Run_Full_Stack_Dev.bat` from `web/` after dependency and environment setup. It applies local D1 migrations and starts the frontend on port 5173 and API on port 8788. `Run_API_Dev.bat` starts the API only.

See the [Web/PWA development guide](web/README.md) for backend bindings and local setup. The tracked launchers and [`package.json`](web/package.json) provide the development commands.

To build the app locally, from `web/`:

```bash
npm run build
```

Advanced Tools remains an area of ongoing development. Feature availability can depend on the build, browser support, and optional service configuration.

## AI-Assisted Development

GTAR1 is independently developed with extensive assistance from AI coding agents.

AI tools help with coding, testing, debugging, and documentation. The project maintainer manages product direction, feature requirements, user experience, quality assurance, and release decisions.

AI-generated code can contain mistakes, so changes are reviewed and tested as the project evolves.

## Credits and License

GTAR1 uses third-party libraries and data under their respective licenses. Guitar chord voicings are sourced from [tombatossals/chords-db](https://github.com/tombatossals/chords-db) and [chordbook/chords-db](https://github.com/chordbook/chords-db), identified as MIT-licensed in the [bundled data attribution](web/src/data/importedChords.ts). See the [demo sample content credits](web/scripts/gtar1-assets/demo-seed/LICENSES.md) for song sources and permissions.

This repository currently has no project-level license file. Public visibility does not grant a general license to reuse, modify, or redistribute GTAR1. Third-party components and content retain their own license terms.
