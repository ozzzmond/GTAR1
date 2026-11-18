## Summary

Related issue: #<!-- number; keep open until owner acceptance -->

PR category (select one):

- [ ] Community proposal: no direct merge into GTAR1 `main`, even with green CI. Owner evaluates; accepted product changes are independently reviewed and ported into original GTAR `dev` for normal verification, QA, and release approval.
- [ ] Maintainer-authorized synchronization: identify owner authorization, approved original GTAR `main` release/commit, GTAR1 public snapshot scope, and corresponding demo-compatible update scope. Preserve GTAR1 identity, branding, configuration, demo data, and governance.
- [ ] Owner-authorized GTAR1 documentation/governance correction: identify authorization and scope; no direct integration of community product changes or release synchronization implied.

Authorization / original GTAR release evidence (where applicable):

Problem, changes, and scope:

## Validation evidence

Base SHA:
Head SHA (before this PR body update):

- `cd web && npm ci`:
- `npm test`:
- `npm run lint`:
- `npm run build`:
- Targeted checks / documentation links / workflow syntax, as applicable:
- Limitations or failures:

The focused regression suite is documented in [web/tests/README.md](../web/tests/README.md). Run validation commands from `web/`; do not claim an unrun test passed.

## Author checklist

- [ ] PR is **DRAFT**, targets `main`, and branches from current `main`.
- [ ] `npm test`, `npm run lint`, and `npm run build` results recorded; failures or unrun checks explained.
- [ ] Scope matches the issue; evidence and limitations recorded above.
- [ ] No credentials, secret values, generated output, or private user content.
- [ ] Application behavior, release identity, demo and Cloudflare configuration preserved unless explicitly authorized.
- [ ] No merge, tags, deployment, or production mutations performed.

Original GTAR remains the canonical development/release source (`dev` for development, `main` for approved production releases). GTAR1 `main` is the public release source; `demo` is the public interactive demonstration; GTAR1 has no dev or staging branch. Release updates follow approved GTAR releases through its existing workflow, with deliberate controlled synchronization rather than blind copying. No automatic feature synchronization, tagging, merging, deployment, or release synchronization; do not modify existing release infrastructure in this PR without explicit scope authorization.

## Owner preview QA (owner only)

Preview URL / evidence (if available):

- [ ] Review rendered documentation, forms, and changed behavior.
- [ ] Review CI results and local validation evidence.
- [ ] Perform preview QA; record result and any required corrections.
- [ ] Owner records proposal disposition or authorized maintainer handoff. Community proposals must not be directly merged; green CI is not integration approval.
- [ ] Owner controls Ready for Review and permitted maintainer merges; release/deployment requires separate owner authorization.
