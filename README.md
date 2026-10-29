# GTAR Revamp — Local-First Standalone Music Stand

GTAR Revamp is a standalone, local-first chord chart and setlist manager built with React, Vite, TypeScript, and Progressive Web App (PWA) offline capabilities.

## Architecture & Guarantees

1. **Local-First & Offline**: Completely usable offline with 0 network calls on startup.
2. **Zero Google Authentication**: No Google Identity Services, no Google Client ID, no AuthGate login barrier. Application mounts directly into the songbook.
3. **No Personal Cloud Sync**: Zero automatic or manual cloud sync engines in the runtime dependency graph.
4. **Isolated Storage**: Operates entirely within the dedicated IndexedDB namespace `gtar_revamp_local_v1`. It never mutates or accesses legacy storage keys or databases (`gtar_db`, `gtar-local-library`, etc.).
5. **Blank Initial Songbook**: Clean installs start with an empty library. No unwanted or pre-loaded songs.
6. **Atomic Local Writes**: Song and setlist modifications are committed in atomic IndexedDB transactions with clear failure reporting.
7. **Minimal JSON Interop**: Clean import and export round-trip supporting both GTAR Revamp and legacy GTAR JSON backups.

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
