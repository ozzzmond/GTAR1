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

## Development status and stack

GTAR1 is an independently governed public-facing product that currently depends on approved releases from original GTAR, the canonical development and release source. The local-first core is working; optional integrations include placeholders, and automated coverage is currently focused on utility behavior rather than browser/UI or optional-service flows.

The frontend uses React 19, TypeScript, Vite 8, Tailwind CSS 4, and a PWA service worker. Local song data uses IndexedDB. Optional backend services use Cloudflare Pages Functions and D1; they are not required to develop the local-first core.

## Development and contribution

Use Node.js 24 LTS and npm. From the repository root:

```sh
cd web
npm ci
npm run dev
```

See the [development guide](web/README.md) for local startup and optional API setup. Before handoff, run these from `web/`:

```sh
npm test
npm run lint
npm run build
```

The [testing guide](web/tests/README.md) describes the focused Node regression suite: ChordPro parsing/transposition, songbook and setlist identity/lifecycle, JSON backup handling, and runner safeguards. The build separately checks TypeScript and PWA precaching.

Read the [contribution policy](CONTRIBUTING.md) and [agent guidance](AGENTS.md). Community contributors may fork GTAR1 from current `main` and submit a **DRAFT PR targeting GTAR1 `main`** linked to an issue. Community PRs are proposals only and must not be directly merged into GTAR1 `main`; green CI does not authorize integration. The owner evaluates proposals, and accepted changes are independently reviewed and ported into original GTAR `dev` for normal development, verification, QA, and release approval. GTAR1 `main` is the public release source; `demo` is the public interactive demonstration. GTAR1 has no dev or staging branch. The owner controls preview QA, Ready for Review, authorized maintainer merges, and deployment.

Report suspected vulnerabilities using the [security reporting instructions](SECURITY.md); keep vulnerability details and private data out of public issues.

## Roadmap and original GTAR

Planned work, subject to assessment and scope approval:

- Expand regression coverage to browser/UI behavior and optional services.
- Develop the broader Advanced Tools extension system beyond its current tool grouping and placeholders.
- Assess substantial, proven features from [original GTAR](https://github.com/ozzzmond/GTAR) for selected future GTAR1 iterations through the approved release path.

Original GTAR remains the canonical development and release source and a valuable reference implementation. GTAR `dev` is the development integration branch; GTAR `main` is the approved production release branch. GTAR `dev` changes undergo normal QA and approval, then approved releases are promoted through original GTAR's existing release workflow. GTAR1 `main` receives the approved public-release source snapshot, and GTAR1 `demo` receives the corresponding demo-compatible update.

GTAR1 maintains its own lightweight governance, branding, configuration, demo data, and public identity; it is not a byte-for-byte copy of GTAR. Synchronization is deliberate and owner-controlled, not blind repository copying. Feature selection requires independent assessment, scope approval, implementation, and testing while avoiding accumulated technical debt. There is no automatic feature or source synchronization, copying, tagging, merging, or deployment. Original GTAR's existing release infrastructure remains in original GTAR; release-promotion machinery is not imported into GTAR1. Planned capabilities are not available merely because they exist in original GTAR.

## AI-Assisted Development

GTAR1 and its canonical GTAR development source evolve with extensive assistance from AI coding agents, under owner direction.

AI tools help with coding, testing, debugging, and documentation. The project maintainer manages product direction, feature requirements, user experience, quality assurance, and release decisions.

AI-generated code can contain mistakes, so changes are reviewed and tested as the project evolves.

## Credits and Acknowledgements

GTAR1 uses third-party libraries and data under their respective licenses. Guitar chord voicings are sourced from [tombatossals/chords-db](https://github.com/tombatossals/chords-db) and [chordbook/chords-db](https://github.com/chordbook/chords-db), identified as MIT-licensed in the [bundled data attribution](web/src/data/importedChords.ts). See the [demo sample content credits](web/scripts/gtar1-assets/demo-seed/LICENSES.md) for song sources and permissions.

Development-tool acknowledgements: [Matt Pocock Skills](https://github.com/mattpocock/skills) ([MIT](https://github.com/mattpocock/skills/blob/main/LICENSE)) and [Impeccable](https://github.com/pbakaus/impeccable) ([Apache-2.0](https://github.com/pbakaus/impeccable/blob/main/LICENSE)).

## License

All Rights Reserved.

GTAR1's original source code is not licensed for redistribution, modification, or commercial use without prior permission.

Third-party libraries, assets, and content remain subject to their respective licenses.
