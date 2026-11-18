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

Community PRs are proposals only and **must not be directly merged into GTAR1 `main`**. Green GTAR1 CI does not authorize direct integration. Owner-authorized GTAR1 documentation/governance work is a separate scope and does not bypass this product-change route.

1. The owner reviews the proposal and decides whether to accept it for development.
2. For each accepted proposal, the owner creates a GitHub issue in [original GTAR](https://github.com/ozzzmond/GTAR/issues) with a link to the GTAR1 PR and credit for its contributor by GitHub handle.
3. After creating the GTAR issue, the owner explains the handoff in a comment on the original PR, links to the new issue, and closes the PR. Implementation and testing take place in original GTAR `dev` under its normal review, verification, and QA process.

Acceptance and cross-repository issue creation are manual owner actions. AI agents and connectors have no authority to bypass the handoff or approval requirements. Automation triggered by untrusted PRs must never receive write credentials.

## Canonical development and public releases

Original GTAR is the canonical development and release source: GTAR `dev` is its development integration branch; GTAR `main` is its approved production release branch. GTAR1 currently depends on approved releases from original GTAR. GTAR1 `main` is the public release source; `demo` serves the public interactive demonstration. GTAR1 has no `dev` or staging branch.

After normal GTAR QA and approval, approved releases are promoted through original GTAR's existing release workflow. GTAR1 `main` receives approved GTAR production release snapshots only through the separately owner-authorized synchronization process. Updates to GTAR1 `demo` follow their own approved release and demo requirements. Preserve GTAR1-specific branding, configuration, demo data, lightweight governance, and public identity. GTAR1 is not a byte-for-byte copy; synchronization is deliberate and controlled, not blind repository copying. There is no automatic feature/source synchronization, tagging, merging, deployment, or release synchronization. Do not modify existing release infrastructure or demo/Cloudflare configuration as routine contribution setup.

The owner performs preview QA and controls Ready for Review, permitted maintainer merges, release, and deployment. CI only installs dependencies, tests, lints, and builds; it does not deploy.
