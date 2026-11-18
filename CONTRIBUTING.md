# Contributing to GTAR1

GTAR1 is a local-first Web/PWA. Its source is public under **All Rights Reserved** terms; public visibility does not grant permission to redistribute, modify, or commercially use the original code. Community contributors may fork GTAR1 and submit draft proposals under the routing policy below; this does not grant a general reuse license. Third-party licenses still apply; see the [README](README.md#license).

Discuss a focused bug or feature in a GitHub issue first. Do not include credentials, personal songbooks, or copyrighted content without permission. See [SECURITY.md](SECURITY.md) for suspected vulnerabilities.

## Development

Use Node.js 24 LTS and npm. Follow [web/README.md](web/README.md) for setup. From `web/`, run:

```sh
npm ci
npm run dev
```

Before handoff, run `npm test`, `npm run lint`, and `npm run build`. Tests cover ChordPro parsing/transposition, songbook and setlist identity/lifecycle, and JSON backup round trips and rejection. See [test instructions](web/tests/README.md) for focused execution and catalog maintenance. The build includes TypeScript, Vite/PWA output, and service worker precache validation.

## Pull requests

Read [AGENTS.md](AGENTS.md). Community contributors may fork current GTAR1 `main` and open a **DRAFT PR into GTAR1 `main`** linked to an issue. Describe scope, validation results, base/head commits, and limitations. Keep changes small and preserve application behavior, release identity, and third-party notices.

Community PRs are proposals only and **must not be directly merged into GTAR1 `main`**. The owner evaluates proposed features and fixes. Accepted changes are independently reviewed and ported into original GTAR `dev`, where normal development, verification, QA, and release approval apply. Green GTAR1 CI does not authorize direct integration. Owner-authorized GTAR1 documentation/governance work is a separate scope and does not bypass this product-change route.

## Canonical development and public releases

Original GTAR is the canonical development and release source: GTAR `dev` is its development integration branch; GTAR `main` is its approved production release branch. GTAR1 currently depends on approved releases from original GTAR. GTAR1 `main` is the public release source; `demo` serves the public interactive demonstration. GTAR1 has no `dev` or staging branch.

After normal GTAR QA and approval, approved releases are promoted through original GTAR's existing release workflow. Maintainer-authorized synchronization provides GTAR1 `main` with the approved public-release source snapshot and `demo` with the corresponding demo-compatible update. Preserve GTAR1-specific branding, configuration, demo data, lightweight governance, and public identity. GTAR1 is not a byte-for-byte copy; synchronization is deliberate and controlled, not blind repository copying. There is no automatic feature/source synchronization, tagging, merging, deployment, or release synchronization. Do not modify existing release infrastructure or demo/Cloudflare configuration as routine contribution setup.

The owner performs preview QA and controls Ready for Review, permitted maintainer merges, release, and deployment. CI only installs dependencies, tests, lints, and builds; it does not deploy.
