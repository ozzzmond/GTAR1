const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('CROSS_COMPONENT_CONTRAST: All 7 factory themes are defined and have compliant properties', () => {
  const themeModalSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ThemeModal.tsx'), 'utf8')
  
  const factoryThemeIds = [
    'solarized-dark',
    'amber-stage',
    'oled-black',
    'paper-light',
    'crimson-stage',
    'azure-stage',
    'e-ink-paper',
  ]

  for (const themeId of factoryThemeIds) {
    assert.ok(themeModalSrc.includes(`id: '${themeId}'`), `ThemeModal must define ${themeId}`)
  }
})

test('CROSS_COMPONENT_CONTRAST: applyCloudThemePaletteToDocument calculates dynamic action & selection foregrounds', () => {
  const backupSettingsSrc = fs.readFileSync(path.resolve(__dirname, '../src/utils/backupSettings.ts'), 'utf8')
  assert.ok(
    backupSettingsSrc.includes('--custom-action-foreground'),
    'backupSettings must calculate and assign --custom-action-foreground'
  )
  assert.ok(
    backupSettingsSrc.includes('--custom-selection-foreground'),
    'backupSettings must calculate and assign --custom-selection-foreground'
  )
})

test('CROSS_COMPONENT_CONTRAST: index.css provides semantic fallback and stage dock styling', () => {
  const cssSrc = fs.readFileSync(path.resolve(__dirname, '../src/index.css'), 'utf8')
  assert.ok(
    cssSrc.includes('--color-app-on-action: var(--custom-action-foreground, #FFFFFF);'),
    'index.css must declare --color-app-on-action token with semantic fallback'
  )
  assert.ok(
    cssSrc.includes('[data-stage-dock="true"]'),
    'index.css must style data-stage-dock with semantic borders and surface colors'
  )
})

test('CROSS_COMPONENT_CONTRAST: Scoped components do not use hardcoded slate/gray/zinc utilities', () => {
  const scopedFiles = [
    'src/components/SongViewer.tsx',
    'src/components/SetlistManager.tsx',
    'src/components/BackupModal.tsx',
    'src/components/LocalProfileModal.tsx',
    'src/components/StageOptionsSheet.tsx',
    'src/components/StageControlDock.tsx',
    'src/components/SongbookHomeView.tsx',
    'src/components/ExplorerNavigation.tsx',
    'src/components/SongLineRenderer.tsx',
    'src/components/Header.tsx',
    'src/components/RecoveryConflictModal.tsx',
  ]

  // Regular expression to match Tailwind slate/gray/zinc classes, avoiding false positives like 'translate-x-5'
  const hardcodedColorRegex = /\b(?:bg|text|border|ring|divide)-(?:slate|zinc|gray)-\d{2,3}(?:\/\d+)?\b/g

  for (const relativePath of scopedFiles) {
    const fullPath = path.resolve(__dirname, '..', relativePath)
    assert.ok(fs.existsSync(fullPath), `${relativePath} must exist`)
    const content = fs.readFileSync(fullPath, 'utf8')
    const matches = content.match(hardcodedColorRegex) || []
    assert.deepEqual(
      matches,
      [],
      `Expected ${relativePath} to have 0 hardcoded slate/zinc/gray classes, but found: ${matches.join(', ')}`
    )
  }
})

test('CROSS_COMPONENT_CONTRAST: StageControlDock and StageOptionsSheet use semantic tokens', () => {
  const dockSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/StageControlDock.tsx'), 'utf8')
  const sheetSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/StageOptionsSheet.tsx'), 'utf8')

  assert.ok(dockSrc.includes('bg-app-surface'), 'StageControlDock must use bg-app-surface')
  assert.ok(dockSrc.includes('border-app-border'), 'StageControlDock must use border-app-border')
  assert.ok(dockSrc.includes('text-app-muted'), 'StageControlDock must use text-app-muted')
  assert.ok(dockSrc.includes('bg-app-action'), 'StageControlDock play/pause button must use bg-app-action')
  assert.ok(dockSrc.includes('text-app-on-action'), 'StageControlDock play/pause button must use text-app-on-action')

  assert.ok(sheetSrc.includes('bg-app-surface'), 'StageOptionsSheet must use bg-app-surface')
  assert.ok(sheetSrc.includes('text-app-heading'), 'StageOptionsSheet must use text-app-heading')
  assert.ok(sheetSrc.includes('text-app-muted'), 'StageOptionsSheet must use text-app-muted')
})
