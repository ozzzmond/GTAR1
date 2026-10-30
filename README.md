# GTAR1 — Local-First Standalone Music Stand

GTAR1 is a standalone, local-first chord chart and setlist manager built with React, Vite, TypeScript, and Progressive Web App (PWA) offline capabilities.

## License & Branding

- **Software Code**: Licensed under the [Apache License, Version 2.0](LICENSE). Free for personal and commercial use without registration or fees.
- **Branding & Mascot Assets**: The names "GTAR", "GTAR1", logos, and character mascots (`Bebegirl1`, `Bebegirl2`, `Bebeboy`) are reserved by the project owner to the extent legally protectable. The mascots are AI-generated artwork produced via ChatGPT (OpenAI) and selected by the project owner. See [NOTICE](NOTICE) for complete details.
- **Privacy & Data Storage**: GTAR1 operates local-first using IndexedDB and localStorage. See [PRIVACY.md](PRIVACY.md) for full disclosure on offline behavior and optional external fonts.

## Architecture & Guarantees

1. **Local-First & Offline**: Completely usable offline with 0 network calls on startup.
2. **Zero Google Authentication**: No Google Identity Services, no Google Client ID, no AuthGate login barrier. Application mounts directly into the songbook.
3. **No Personal Cloud Sync**: Zero automatic or manual cloud sync engines in the runtime dependency graph.
4. **Isolated Storage**: Operates entirely within the dedicated IndexedDB namespace `gtar_revamp_local_v1`. It never mutates or accesses legacy storage keys or databases (`gtar_db`, `gtar-local-library`, etc.).
5. **Blank Initial Songbook**: Clean installs start with an empty library. No unwanted or pre-loaded songs.
6. **Atomic Local Writes**: Song and setlist modifications are committed in atomic IndexedDB transactions with clear failure reporting.
7. **Minimal JSON Interop**: Clean import and export round-trip supporting both GTAR1 and legacy GTAR JSON backups.

## Provenance

- **Original Source Repository**: `ozzzmond/GTAR`
- **Original Source Commit SHA**: `45ce8442859b66843f4755733e7f9a66984df51a`
- **Reused / Ported Modules**:
  - `src/utils/musicalKey.ts`: Pitch class mapping, canonical key normalization, flat key preservation (`Bb`, `Eb`, `Ab`, `Db`, `Gb`), and pitch equivalence.
  - `src/utils/chordParser.ts`: Deterministic chord model and parser (root note validation, chord quality regex, slash-bass support).
  - `src/utils/enharmonicPolicy.ts`: Target-key aware enharmonic spelling rules, flat-preferring key tables.
  - `src/utils/chordTransposer.ts`: Chord token and text transposer (-11 to +11 semitones, zero-offset exact preservation).
  - `src/utils/chordProMetadata.ts`: Parsing and syncing the 6 canonical directives (`title`, `artist`, `key`, `tempo`, `time`, `year`), `original_key` preservation.
  - `src/utils/chordLyricLayout.ts`: Word-wrapped chord-lyric segment anchoring.
  - `src/utils/songParser.ts`: ChordPro bracket parsing, directive extraction, section header detection, key auto-detection.

## DEV diagnostics (Issue #41)

The existing GTAR1 app environment controls diagnostics at compile time: only
`development` includes the **DEV diagnostics** button. Standard builds retain the
repository's DEV default, including the DEV PWA. Set `GTAR_ENV=production` or use
`--mode production-pwa` for PROD. Either explicit production environment setting
or production-pwa mode disables diagnostics even with a conflicting DEV override. Unknown
environment names disable diagnostics. No runtime flag can enable them in PROD.

The buffer holds at most 20 fixed events, evicting the oldest first. It lives only
in memory for the current tab session. Closing the panel preserves events; reload,
tab close, or **Clear logs** discards them. No localStorage or IndexedDB is used,
so storage denial and quota exhaustion cannot prevent diagnostics exports.

Events cover startup, library load failure, audio start failures, browser
online/offline reports, and export failure. Only predefined event codes and fixed
messages are accepted; raw exceptions and caller-supplied content are discarded.
Severity, area, and UTC time accompany each event. No global console, network,
URL, song, profile, backup, token, or stack-trace capture occurs.

**Export logs** manually downloads a schema-versioned plain-text `.log`, capped at
16 KiB, with capture/export UTC times and app version. The filename includes a
coarse browser-reported platform/browser/device class, UTC time, and fresh random
suffix with a session counter. Unknown profiles fall back to `unknown`. This
estimate can be spoofed and is not verified device identity. No raw user-agent or
stable device identifier is retained. Export works locally without network access
or uploads. Review exported files before sharing them.

## Versioning Scheme

- **Semantic Versioning** without `v` prefix.
- **Environments**:
  - `dev`: `0.1.0-dev`
  - `stage`: `0.1.0-rc.1` (RC suffix)
  - `prod`: `0.1.0`
- **Tags**: No live tags yet (as per hold policy).

## Branch Plan

- `main`: Canonical production-ready baseline.
- `stage`: Staging environment for release candidate verification.
- `dev`: Active development branch.

## Local Run Instructions

### Prerequisites
- Node.js >= 20.x
- npm >= 10.x

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Run local development server (starts on http://localhost:5173)
npm run dev

# 3. Run targeted unit test suite
npm test

# 4. Build standalone production PWA
npm run build

# 5. Preview production build locally
npm run preview
```

### Continuous integration

`.github/workflows/ci.yml` validates PRs targeting `dev` or `main`, pushes to
`dev`, and manual runs. It uses Node.js 24.20.0 and `npm ci`, builds the
TypeScript/production PWA, installs Chromium, then runs `npm test`. The build
must precede tests because the browser suite serves `dist/`. Firefox keeps its
existing optional skip behavior; Chromium and test assertions are mandatory.

The read-only workflow has no deployment credentials or deployment steps.
Native Actions logs provide detailed evidence; a compact `ci-verification`
artifact records the tested commit and step results with seven-day retention.
For PRs, the tested SHA is GitHub's merge commit; the receipt also records the
head SHA. Receipt availability depends on a real run completing the upload.
Branch protection and required checks are managed separately; this workflow
does not configure or enforce repository merge rules.
