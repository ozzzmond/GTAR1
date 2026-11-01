# Agent Rules — GTAR1 Project

## Response Style
- Be concise. Skip narration like "I will now...", "Let me...", "Now I'll...",
  or "Let's...". Just do the work and report results.
- No decorative separators (====, ----, ****, ~~~~) in any output.
- No step headers. Report what was done, not a plan of what you're about to do.
- Do not restate the directive/prompt back before acting on it.
- Report findings, changes made, and test results directly — file paths,
  what changed, pass/fail status.
- If nothing needs to change for a given item, say so in one line.
- Never paste raw logs, full test output, or full diffs into chat.
- Runtime evidence is transient: evaluate in-memory; do not write receipts or
  runtime logs into the repository or local log folders.
- GitHub is the canonical audit trail (commits, PRs, CI runs).
- Completed directives produce compact final chat reports in the
  Caveman_Micro+Perspective dense key-value schema. On pass, compact
  aggressively; on fail/error, keep decision-critical diagnostics.

## Project Profile
- GTAR1 is a standalone, local-first chord chart and setlist PWA
  (React, Vite, TypeScript). App code lives at the repo root (src/, tests/,
  public/) — there is no web/ subfolder.
- Hard guarantees (see README.md; never weaken):
  - Zero Google: no Google Identity Services, Client ID, auth gate, or Google
    credentials of any kind. Never add them.
  - No cloud sync engines in the runtime dependency graph.
  - 0 network calls on startup; fully usable offline.
  - Storage only in IndexedDB namespace `gtar_revamp_local_v1`; never read or
    mutate legacy GTAR keys/databases (`gtar_db`, `gtar-local-library`, etc.).
  - Clean installs start with an empty library.
  - Song/setlist writes are atomic IndexedDB transactions with clear failure
    reporting; no last-write-wins, no automatic merging, no destructive
    recovery cleanup.
- Modules ported from GTAR (src/utils/musicalKey.ts, chordParser.ts,
  enharmonicPolicy.ts, chordTransposer.ts, chordProMetadata.ts,
  chordLyricLayout.ts, songParser.ts): when changing behavior here, state in
  the report whether GTAR has the same behavior. Do not edit GTAR from this repo.
- LICENSE (Apache-2.0), NOTICE, and mascot/branding assets are owner-controlled:
  do not modify unless explicitly instructed.

## Scope and Safety
- No scope creep, unrelated refactors, or dependency changes unless the
  directive requires them.
- Do not hide, skip, or weaken tests or checks to get a pass.
- Audit/investigation work is read-only unless fixes are explicitly authorized.
- Never commit, push, tag, merge, deploy, reset, or stash without explicit
  human authorization in the current directive.
- If a task doesn't clearly say whether it allows git/release actions, ask.

## Verification
The browser suite serves dist/, so build before testing:

```powershell
npm run build
npm test
```

Report on pass as compact metrics, e.g. `build=PASS|test=PASS (N/N)`.
CI (.github/workflows/ci.yml) also runs a PROD PWA build with
`GTAR_ENV=production`; run it locally only when the change touches PWA,
environment, diagnostics, or icons.

## Versioning
- Semantic Versioning without `v` prefix: dev `0.1.0-dev`, stage
  `0.1.0-rc.N`, prod `0.1.0`.
- No live tags yet (hold policy). Do not create tags or bump versions unless
  explicitly instructed.
- Branches: dev = development; main = release. PRs target dev.

## Agent Skills (mattpocock/skills)
- Source: github.com/mattpocock/skills, installed as an editable copy pinned
  to upstream commit `4ae2317ddb22`. Do not auto-update; updates go through
  a normal PR to dev.
- If a named skill is missing in your environment, do not block: follow its
  one-line description below and say so in your report.
- Precedence: this file overrides any skill. If a skill step says to commit,
  merge, tag, push, open a tracker issue, or spawn subagents, skip that step
  and report it instead.
- Installed and allowed:
  - grill-with-docs / grilling — before any non-trivial change. Grilling is
    the one exception to the no-questions style: ask one question at a time,
    each with a recommended answer, only when the user invokes it.
  - domain-modeling — keeps GLOSSARY.md (repo root) and docs/adr/ current.
  - tdd — features and bug fixes, red-green-refactor, one vertical slice at a
    time, using the Verification commands above.
  - diagnosing-bugs — regressions, especially chord/key, transpose, and
    restore/backup integrity.
  - handoff — end of session, compact; no receipt files.
  - pr — PR body shape for PRs targeting dev.
- Not allowed (not installed; do not fetch or emulate): implement,
  implement-spec, wayfinder, triage, to-tickets, code-review,
  improve-codebase-architecture, or any parallel subagent fan-out.

## Domain Terms
Use these exact terms in code, tests, PRs, and reports:
- ORIGINAL_KEY — verified source/original song key.
- CHART_KEY — key the stored chart is written in; may differ from ORIGINAL_KEY.
- PERFORMANCE_KEY — CHART_KEY plus applied transpose state.
- TRANSPOSE_OFFSET — semitone offset; TRANSPOSE_ZERO means ORIGINAL_KEY.
- Never guess ORIGINAL_KEY; never silently change a saved PERFORMANCE_KEY.
- ChordPro `{key}` equals ORIGINAL_KEY at rest. Only transposition changes the
  key in use (PERFORMANCE_KEY); transposing never rewrites `{original_key}`.
