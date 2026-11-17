# GTAR1 regression tests

Run `npm test` from `web/` (Node.js 24). The suite uses Node’s test runner and the installed TypeScript compiler; no browser, network, credentials or legacy release infrastructure is required. Each file runs in an isolated process.

Target a file with `node --test tests/chordPro.test.cjs`. TypeScript is transpiled in memory; `npm run build` separately checks types. Only browser storage is substituted in backup tests. Fixtures are synthetic.

All current tests default to fast in `tiers.json`; other retained tier scripts fail when no tests are selected. No sharding is needed. After adding/removing files, run `node scripts/test-catalog.cjs --write` and classify the generated entry below. CI runs the entire fast suite.

<!-- test-catalog:AUTH:start -->
<!-- test-catalog:AUTH:end -->

<!-- test-catalog:CLOUD_SYNC_AND_STORAGE:start -->
- [jsonBackup.test.cjs](jsonBackup.test.cjs)
<!-- test-catalog:CLOUD_SYNC_AND_STORAGE:end -->

<!-- test-catalog:THEMES:start -->
<!-- test-catalog:THEMES:end -->

<!-- test-catalog:STAGE:start -->
<!-- test-catalog:STAGE:end -->

<!-- test-catalog:SONGBOOK_AND_EDITOR:start -->
- [chordPro.test.cjs](chordPro.test.cjs)
- [library.test.cjs](library.test.cjs)
<!-- test-catalog:SONGBOOK_AND_EDITOR:end -->

<!-- test-catalog:SECURITY_AND_API:start -->
<!-- test-catalog:SECURITY_AND_API:end -->

<!-- test-catalog:INFRASTRUCTURE:start -->
- [runner.test.cjs](runner.test.cjs)
<!-- test-catalog:INFRASTRUCTURE:end -->

<!-- test-catalog:UNCLASSIFIED:start -->
<!-- test-catalog:UNCLASSIFIED:end -->

