# GTAR1 agent guidance

- GTAR1 is an independently runnable local-first Web/PWA in `web/`. Read applicable nested `AGENTS.md` files before editing. Keep changes within the requested scope and preserve user data and existing behavior.
- `main` is the canonical integration branch; `demo` serves the public interactive demo. There is no `dev` or staging branch. Create feature branches from freshly fetched `origin/main`.
- Deliver changes through a **DRAFT PR targeting `main`**. Include the issue, base/head SHAs, changed scope, validation evidence, and limitations. The owner alone performs preview QA, marks Ready for Review, merges, and authorizes releases/deployment. Do not merge, tag, deploy, or mutate production.
- From `web/`, run `npm ci`, `npm run lint`, `npm test`, and `npm run build` before handoff. Report failures accurately; do not weaken checks. The focused regression suite and execution instructions live in [web/tests/README.md](web/tests/README.md).
- Preserve GTAR1 branding, release identity, existing demo behavior/configuration, and Cloudflare configuration unless explicitly authorized. Do not import legacy release controllers or promotion machinery.
- Never commit credentials, secret values, private user content, or generated build output. Keep optional services separate so the core remains usable without sign-in.
- Preserve All Rights Reserved wording and third-party notices. Public visibility grants no reuse license. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
