const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) =>
    module._compile(
      ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
      }).outputText,
      filename
    )
}

const { JSDOM } = require('jsdom')
const boot = new JSDOM('<html><body></body></html>')
global.window = boot.window
global.document = boot.window.document

const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React

const theme = require('../src/components/ThemeModal.tsx')
const backup = require('../src/utils/backupSettings.ts')
const { exportCustomPaletteJson } = require('../src/utils/customPaletteJson.ts')
boot.window.close()

// ---------------------------------------------------------------------------
// FIX 1 TEST: IMPORT_IDENTITY
// ---------------------------------------------------------------------------
test('FIX_1: IMPORT_IDENTITY - imported "YM Red Theme" is reflected in editor, persisted on Save & Apply, and Cancel is safe', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://gtar.local',
    pretendToBeVisual: true,
  })
  Object.assign(global, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  })

  const root = createRoot(document.getElementById('root'))

  // Mount ThemeModal
  await act(async () => {
    root.render(
      React.createElement(theme.ThemeModal, {
        isOpen: true,
        onClose: () => {},
        currentTheme: 'paper-light',
        customColors: theme.DEFAULT_CUSTOM_COLORS,
      })
    )
  })

  // Open Custom Palette Editor for Paper Cream Light
  const customizeBtn = document.querySelector('[data-testid="customize-preset-paper-light-btn"]')
  assert.ok(customizeBtn, 'Must find customize button for paper-light')
  await act(async () => {
    customizeBtn.click()
  })

  // Verify initial theme name is "Paper Cream Light Custom"
  const nameInput = document.querySelector('[aria-label="Custom theme name"]')
  assert.ok(nameInput, 'Theme name input must exist in editor')
  assert.equal(nameInput.value, 'Paper Cream Light Custom')

  // Open import modal
  const importBtn = document.querySelector('[data-testid="import-palette-btn"]')
  assert.ok(importBtn, 'Import button must exist')
  await act(async () => {
    importBtn.click()
  })

  // Prepare YM Red Theme payload
  const ymRedPayload = exportCustomPaletteJson({
    ...theme.DEFAULT_CUSTOM_COLORS,
    bgHex: '#3A0505',
    actionColor: '#DC2626',
    sectionIconColor: '#F87171',
    identity: {
      factoryId: 'paper-light',
      displayName: 'YM Red Theme',
    },
  })

  // Enter payload in textarea
  const textarea = document.querySelector('[data-testid="palette-json-textarea"]')
  assert.ok(textarea, 'JSON import textarea must exist')
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(
      textarea,
      JSON.stringify(ymRedPayload)
    )
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }))
  })

  // Apply import
  const applyImportBtn = document.querySelector('[data-testid="apply-import-json-btn"]')
  assert.ok(applyImportBtn, 'Apply import button must exist')
  await act(async () => {
    applyImportBtn.click()
    await new Promise((r) => setTimeout(r, 850))
  })

  // VERIFY: Theme name field immediately displays "YM Red Theme"
  const updatedNameInput = document.querySelector('[aria-label="Custom theme name"]')
  assert.equal(updatedNameInput.value, 'YM Red Theme', 'Editor must immediately display imported "YM Red Theme"')

  // Save & Apply
  const saveApplyBtn = document.querySelector('[data-testid="save-apply-palette-btn"]')
  assert.ok(saveApplyBtn, 'Save & Apply button must exist')
  await act(async () => {
    saveApplyBtn.click()
  })

  // VERIFY: Persisted to localStorage under factoryThemeOverrides['paper-light']
  const appearanceRaw = localStorage.getItem(backup.SETTINGS_KEYS.appearance)
  assert.ok(appearanceRaw, 'Appearance state must be saved')
  const appearance = JSON.parse(appearanceRaw)
  assert.ok(appearance.factoryThemeOverrides['paper-light'], 'paper-light override must exist')
  assert.equal(
    appearance.factoryThemeOverrides['paper-light'].identity.displayName,
    'YM Red Theme',
    'Persisted override must have displayName "YM Red Theme"'
  )
  assert.equal(
    appearance.factoryThemeOverrides['paper-light'].identity.factoryId,
    'paper-light',
    'Factory identity must remain paper-light'
  )
  assert.equal(
    appearance.factoryThemeOverrides['paper-light'].actionColor,
    '#DC2626'
  )
  // Ensure unrelated presets are untouched
  assert.equal(appearance.factoryThemeOverrides['azure-stage'], undefined)
  assert.equal(appearance.factoryThemeOverrides['crimson-stage'], undefined)

  // Verify Cancel safety: open editor again, enter uncommitted change, click Cancel
  await act(async () => {
    customizeBtn.click()
  })
  const reOpenedInput = document.querySelector('[aria-label="Custom theme name"]')
  assert.equal(reOpenedInput.value, 'YM Red Theme')

  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
      reOpenedInput,
      'Unsaved Name'
    )
    reOpenedInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  assert.equal(reOpenedInput.value, 'Unsaved Name')

  const cancelBtns = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'Cancel')
  assert.ok(cancelBtns.length > 0, 'Cancel button must exist in editor')
  await act(async () => {
    cancelBtns[cancelBtns.length - 1].click()
  })

  // Still preserved as 'YM Red Theme'
  const postCancelAppearance = JSON.parse(localStorage.getItem(backup.SETTINGS_KEYS.appearance))
  assert.equal(postCancelAppearance.factoryThemeOverrides['paper-light'].identity.displayName, 'YM Red Theme')

  await act(async () => {
    root.unmount()
  })
})

// ---------------------------------------------------------------------------
// FIX 2 TEST: SONG_CARD_STAGE_ACTION
// ---------------------------------------------------------------------------
test('FIX_2: SONG_CARD_STAGE_ACTION - song card Stage button uses semantic theme tokens and no green overrides', () => {
  const sbPath = path.resolve(__dirname, '../src/components/SongbookHomeView.tsx')
  const content = fs.readFileSync(sbPath, 'utf8')

  // Stage button on song card
  assert.ok(
    content.includes('className="px-2 py-0.5 rounded-md bg-app-action hover:brightness-110 text-app-on-action font-semibold text-[11px] transition-colors flex items-center gap-1"'),
    'Song card Stage button must use bg-app-action and text-app-on-action'
  )

  // Ensure no hardcoded green/emerald in Stage/play actions
  assert.ok(!content.includes('bg-emerald-700/80 hover:bg-emerald-600'), 'Old hardcoded emerald button must be removed')
  assert.ok(!content.includes('bg-emerald-600 hover:bg-emerald-500'), 'Hardcoded emerald play button in setlist must be removed')
  assert.ok(!content.includes('hover:bg-app-hover text-emerald-400 flex items-center gap-2'), 'Hardcoded emerald in play menu must be removed')
})

// ---------------------------------------------------------------------------
// FIX 3 TEST: EXPLORER_HEADINGS
// ---------------------------------------------------------------------------
test('FIX_3: EXPLORER_HEADINGS - All Songs and All Setlists headings use high-contrast semantic tokens', () => {
  const sbPath = path.resolve(__dirname, '../src/components/SongbookHomeView.tsx')
  const content = fs.readFileSync(sbPath, 'utf8')

  // Check All Songs heading
  assert.ok(
    content.includes('ui-primary-text text-base font-bold text-app-heading flex items-center gap-2'),
    'All Songs heading must use ui-primary-text and text-app-heading'
  )
  assert.ok(!content.includes('text-base font-bold text-white flex items-center gap-2'), 'All Songs heading must not be hardcoded text-white')
})

// ---------------------------------------------------------------------------
// FIX 4 TEST: SECTION_ICONS
// ---------------------------------------------------------------------------
test('FIX_4: SECTION_ICONS - Songbook and Setlist section-heading icons map to semantic sectionIconColor token', () => {
  const sbPath = path.resolve(__dirname, '../src/components/SongbookHomeView.tsx')
  const content = fs.readFileSync(sbPath, 'utf8')

  // All Songs section heading icon
  assert.ok(
    content.includes('<Music className="ui-section-icon w-4 h-4 text-app-section" />'),
    'Songbook / All Songs heading icon must use ui-section-icon and text-app-section'
  )
  // Setlists section heading icon
  assert.ok(
    content.includes('<ListMusic className="ui-section-icon w-4 h-4 text-app-section" />'),
    'All Setlists heading icon must use ui-section-icon and text-app-section'
  )

  // Ensure hardcoded blue/purple overrides are removed from section headings
  assert.ok(!content.includes('<Music className="w-4 h-4 text-sky-400" />'), 'Hardcoded sky-400 music note icon must be removed')
  assert.ok(!content.includes('<ListMusic className="w-4 h-4 text-purple-400" />'), 'Hardcoded purple-400 setlist icon must be removed')
})

// ---------------------------------------------------------------------------
// FIX 5 TEST: LOCAL_STANDALONE_BADGE
// ---------------------------------------------------------------------------
test('FIX_5: LOCAL_STANDALONE_BADGE - visible Local Standalone badge removed while preserving core capability', () => {
  const headerPath = path.resolve(__dirname, '../src/components/Header.tsx')
  const headerContent = fs.readFileSync(headerPath, 'utf8')

  // Badge must not be present
  assert.ok(!headerContent.includes('Local Standalone'), 'Local Standalone badge text must be removed from Header')
  assert.ok(!headerContent.includes('title="Local Standalone"'), 'Local Standalone title attribute must be removed from Header')

  // Core header features and PWA logo remain intact
  assert.ok(headerContent.includes('src="/pwa-192x192.png"'), 'PWA mascot logo preserved')
  assert.ok(headerContent.includes('GTAR1_VERSION'), 'Version display preserved')
  assert.ok(headerContent.includes('role="search"'), 'Search bar preserved')
})
