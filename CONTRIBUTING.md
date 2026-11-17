# Contributing to GTAR1

GTAR1 is a local-first Web/PWA. Its source is public under **All Rights Reserved** terms; public visibility does not grant permission to redistribute, modify, or commercially use the original code. Ask the owner for permission before contributing changes. Third-party licenses still apply; see the [README](README.md#license).

Discuss a focused bug or feature in a GitHub issue first. Do not include credentials, personal songbooks, or copyrighted content without permission. See [SECURITY.md](SECURITY.md) for suspected vulnerabilities.

## Development

Use Node.js 24 LTS and npm. Follow [web/README.md](web/README.md) for setup. From `web/`, run:

```sh
npm ci
npm run dev
```

Before handoff, run `npm run lint` and `npm run build`. The latter includes TypeScript, Vite/PWA output, and service worker precache validation. The exported checkout has test runner scripts but no `web/tests/` suite, so `npm test` is not a current gate. Add focused tests with future behavior changes when a working suite is established.

## Pull requests

Read [AGENTS.md](AGENTS.md). Branch from current `origin/main`; open a **DRAFT PR into `main`** linked to the issue. Describe scope, validation results, base/head commits, and any limitations. Keep changes small and preserve application behavior, release identity, and third-party notices.

`main` is the canonical integration branch. `demo` is the public interactive demo branch, not a staging gate; there is no `dev` or staging branch. Do not change demo or Cloudflare configuration as routine contribution setup.

The owner performs preview QA and controls Ready for Review, merge, release, and deployment. CI only installs dependencies, lints, and builds; it does not deploy.
