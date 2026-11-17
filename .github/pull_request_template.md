## Summary

Related issue: #<!-- number; keep open until owner acceptance -->

Problem, changes, and scope:

## Validation evidence

Base SHA:
Head SHA (before this PR body update):

- `cd web && npm ci`:
- `npm run lint`:
- `npm run build`:
- Targeted checks / documentation links / workflow syntax, as applicable:
- Limitations or failures:

Test scripts alone do not establish a working suite; this checkout has no `web/tests/` suite. Do not claim an unrun test passed.

## Author checklist

- [ ] PR is **DRAFT**, targets `main`, and branches from current `main`.
- [ ] Scope matches the issue; evidence and limitations recorded above.
- [ ] No credentials, secret values, generated output, or private user content.
- [ ] Application behavior, release identity, demo and Cloudflare configuration preserved unless explicitly authorized.
- [ ] No merge, tags, deployment, or production mutations performed.

## Owner preview QA (owner only)

Preview URL / evidence (if available):

- [ ] Review rendered documentation, forms, and changed behavior.
- [ ] Review CI results and local validation evidence.
- [ ] Perform preview QA; record result and any required corrections.
- [ ] Owner decides Ready for Review and merge; release/deployment requires owner control separately.
