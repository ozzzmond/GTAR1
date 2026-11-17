# GTAR1 Web/PWA

GTAR1's application lives in `web/`. See the [project README](../README.md) for features, demo behavior, and All Rights Reserved terms, and [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution policy.

## Local development

Use Node.js 24 LTS and npm (also used by CI). From the repository root:

```sh
cd web
npm ci
npm run dev
```

Open http://localhost:5173. Keep that port available; Vite uses a strict port. The local songbook, chart editing, and setlists do not require sign-in or server credentials. Browser data is origin-specific; export backups before clearing it.

`npm run dev` starts the Vite frontend, not Pages Functions. Optional account and online services need additional backend configuration and network access; they are not prerequisites for the local-first core.

## Optional local API

The tracked [Run_Full_Stack_Dev.bat](Run_Full_Stack_Dev.bat) starts Vite and the local Pages Functions API on Windows. [Run_API_Dev.bat](Run_API_Dev.bat) starts only the API. Both apply tracked D1 migrations **locally** before API startup; the API uses port 8788. On other systems, the equivalent scripts are `npm run d1:migrate:local` followed by `npm run dev:api`, with Vite in another terminal.

For optional Google sign-in, supply your own frontend `VITE_GOOGLE_CLIENT_ID` in ignored `.env.local`. There is no tracked `.env.example` in this checkout. Register the exact local origin with the OAuth client. Pages Functions requires its own runtime bindings in ignored `.dev.vars`: `DB` is configured in [wrangler.jsonc](wrangler.jsonc); the OAuth audience is `GOOGLE_CLIENT_ID` (or its supported `VITE_GOOGLE_CLIENT_ID` alias), and `AUTH_SECRET` is a private server-only session-signing secret. Frontend variables do not configure server bindings. Never put a signing secret in a `VITE_` variable or commit credentials. Account access may also require owner-managed approval; local startup does not configure hosted accounts.

No hosted setup, migrations, or deployment are part of this guide's verification steps. Existing demo and Cloudflare configuration remain owner-controlled.

## Development checks

Run from `web/`:

- `npm ci` — install the locked dependency set.
- `npm run lint` — whole-workspace ESLint.
- `npm run build` — TypeScript checks, Vite/PWA build into `dist/`, and service worker precache validation.
- `npm run preview` — serve the built frontend locally; this does not start the API.

Run `npm test` for the focused automated regression suite. See [tests/README.md](tests/README.md) for coverage, single-file execution, and catalog maintenance. CI runs tests, lint, and build; it does not deploy or run migrations.
