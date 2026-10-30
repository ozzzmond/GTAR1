// Vite compiles CSS modules; these DOM tests need only their class names.
require.extensions['.css'] = module => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) } }
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

for (const ext of ['.ts', '.tsx']) {
  require.extensions[ext] = (module, filename) => {
    const raw = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env', '({DEV:false})')
    const output = ts.transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
      },
    }).outputText
    return module._compile(output, filename)
  }
}

const { JSDOM } = require('jsdom')
const boot = new JSDOM('<html><body></body></html>')
global.window = boot.window
global.document = boot.window.document
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
boot.window.close()
delete global.window
delete global.document

const theme = require('../src/components/ThemeModal.tsx')
const stageView = require('../src/components/StageView.tsx')
const customPaletteEditor = require('../src/components/CustomPaletteEditor.tsx')
const backupModal = require('../src/components/BackupModal.tsx')
const backupSettings = require('../src/utils/backupSettings.ts')
const customFonts = require('../src/utils/customFonts.ts')
const jsonBackup = require('../src/utils/jsonBackup.ts')
const appModule = require('../src/App.tsx')

const SAMPLE_SONG = {
  id: 'song-test-1',
  title: 'Test Amazing Song',
  artist: 'Stage Performer',
  originalKey: 'G',
  key: 'G',
  rawContent: '{title: Test Amazing Song}\n{artist: Stage Performer}\n{key: G}\n[G]Amazing [C]grace how [G]sweet\n',
  chordProBody: '{title: Test Amazing Song}\n{artist: Stage Performer}\n{key: G}\n[G]Amazing [C]grace how [G]sweet\n',
  tags: ['hymn'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

async function createHarness(html = '<html><head></head><body><div id="root"></div></body></html>') {
  const dom = new JSDOM(html, { url: 'https://gtar.test' })
  global.window = dom.window
  global.document = dom.window.document
  global.localStorage = dom.window.localStorage
  global.IS_REACT_ACT_ENVIRONMENT = true
  const root = createRoot(document.getElementById('root'))
  return {
    dom,
    root,
    render: (component) => act(async () => root.render(component)),
    cleanup: async () => {
      await act(async () => root.unmount())
      dom.window.close()
      delete global.window
      delete global.document
      delete global.localStorage
      delete global.IS_REACT_ACT_ENVIRONMENT
    },
  }
}

// =============================================================================
// FIX 1: P1_EINK_STAGE - Stage surface and text contrast across 7 factory themes
// =============================================================================
test('FIX_1: E-Ink and all 7 factory themes use paired semantic Stage surface/text tokens and readable headers', async () => {
  const harness = await createHarness()
  try {
    for (const themeOption of theme.THEME_OPTIONS) {
      // 1. Apply theme runtime
      theme.applyThemeRuntime(themeOption.id, theme.DEFAULT_CUSTOM_COLORS)
      const stageBg = document.documentElement.style.getPropertyValue('--custom-stage-bg')
      const stageText = document.documentElement.style.getPropertyValue('--custom-stage-text')
      const headerPrimary = document.documentElement.style.getPropertyValue('--custom-headerPrimaryText')

      assert.ok(stageBg, `Theme ${themeOption.id} must define --custom-stage-bg`)
      assert.ok(stageText, `Theme ${themeOption.id} must define --custom-stage-text`)
      assert.ok(headerPrimary, `Theme ${themeOption.id} must define --custom-headerPrimaryText`)

      // For E-Ink Paper specifically:
      if (themeOption.id === 'e-ink-paper') {
        assert.equal(stageBg.toLowerCase(), '#ededed', 'E-Ink background is light gray paper #ededed')
        assert.equal(stageText.toLowerCase(), '#111111', 'E-Ink lyrics text is near-black #111111')
        assert.ok(
          ['#111111', '#111827'].includes(headerPrimary.toLowerCase()),
          'E-Ink header text is dark readable on light header, not white!'
        )
      }

      // Render StageView
      let exited = false
      let newOffset = 0
      await harness.render(
        React.createElement(stageView.StageView, {
          song: SAMPLE_SONG,
          transposeOffset: 0,
          onTransposeChange: (off) => { newOffset = off },
          onBack: () => { exited = true },
        })
      )

      const stageRoot = document.querySelector('[data-stage-view="true"]')
      assert.ok(stageRoot, 'StageView root must have data-stage-view="true"')
      assert.equal(stageRoot.style.backgroundColor, 'var(--custom-stage-bg, #020617)')
      assert.equal(stageRoot.style.color, 'var(--custom-stage-text, #f1f5f9)')

      const header = document.querySelector('header[role="banner"]')
      assert.ok(header, 'Header banner exists')
      assert.equal(header.style.backgroundColor, 'var(--custom-chrome-header-bg, rgba(15, 23, 42, 0.9))')

      const title = document.querySelector('.stage-title-text')
      assert.ok(title, 'Title element exists')
      assert.equal(title.style.color, 'var(--custom-headerPrimaryText, var(--custom-uiPrimaryText, #ffffff))')

      // Verify exit and controls
      const exitBtn = document.querySelector('button[aria-label="Exit Stage and return to Music Explorer"]')
      assert.ok(exitBtn, 'Exit button exists')
      await act(async () => exitBtn.click())
      assert.equal(exited, true, 'Stage exit callback fired')
    }
  } finally {
    await harness.cleanup()
  }
})

// =============================================================================
// FIX 2: P1_FONT_ACTIVATION - Inert preview and remote font activation gate
// =============================================================================
test('FIX_2: Font descriptors inert on import/preview; activate only on explicit save; Cancel leaves zero active fonts', async () => {
  const harness = await createHarness()
  try {
    let savedPalette = null
    let closed = false

    const fontPayload = {
      format: 'gtar-custom-palette',
      version: 2,
      colors: {
        ...theme.DEFAULT_CUSTOM_COLORS,
        bgHex: '#121820',
      },
      fonts: {
        ui: { source: 'google', family: 'Poppins' },
        stage: { source: 'stylesheet', family: 'Open Sans', url: 'https://fonts.cdnfonts.com/css/open-sans' },
      },
    }

    await harness.render(
      React.createElement(customPaletteEditor.CustomPaletteEditor, {
        isOpen: true,
        onClose: () => { closed = true },
        customColors: theme.DEFAULT_CUSTOM_COLORS,
        onSaveAndApply: (palette) => { savedPalette = palette },
      })
    )

    // Verify initial head contains zero font links
    let links = document.head.querySelectorAll('link[data-gtar-font]')
    assert.equal(links.length, 0, 'No font links in head initially')

    // Open import modal
    const importBtn = document.querySelector('[data-testid="import-palette-btn"]')
    assert.ok(importBtn, 'Import JSON button exists')
    await act(async () => importBtn.click())

    // Paste remote font JSON into textarea
    const textarea = document.querySelector('[data-testid="palette-json-textarea"]')
    assert.ok(textarea, 'JSON textarea exists')
    await act(async () => {
      textarea.value = JSON.stringify(fontPayload)
      textarea.dispatchEvent(new window.Event('change', { bubbles: true }))
    })

    // Click Import & Preview
    const applyImportBtn = document.querySelector('[data-testid="apply-import-json-btn"]')
    assert.ok(applyImportBtn, 'Apply import button exists')
    await act(async () => applyImportBtn.click())

    // CRITICAL ASSERTION: No external stylesheets injected during preview/import!
    links = document.head.querySelectorAll('link[data-gtar-font]')
    assert.equal(links.length, 0, 'Import/preview MUST NOT inject remote stylesheet link into head!')

    // Click Cancel
    const cancelBtn = document.querySelector('[data-testid="cancel-palette-editor-btn"]')
    assert.ok(cancelBtn, 'Cancel button exists')
    await act(async () => cancelBtn.click())
    assert.equal(closed, true, 'Editor closed on cancel')
    assert.equal(savedPalette, null, 'Nothing committed on cancel')

    // Global CSS must have zero active font links
    links = document.head.querySelectorAll('link[data-gtar-font]')
    assert.equal(links.length, 0, 'Cancel leaves zero font links active')

    // URL policy validation
    assert.equal(customFonts.safeFontUrl('http://insecure.test/font.css'), false, 'HTTP URLs rejected')
    assert.equal(customFonts.safeFontUrl('https://valid.test/font.css'), true, 'HTTPS URLs accepted')
    assert.equal(customFonts.safeFontUrl('javascript:alert(1)'), false, 'Non-HTTPS URLs rejected')
  } finally {
    await harness.cleanup()
  }
})

// =============================================================================
// FIX 3: P1_INVALID_COLOR_BACKUP_CRASH - Reject invalid color & isolate backup
// =============================================================================
test('FIX_3: CustomPaletteEditor rejects invalid color token; BackupModal isolates corrupt appearance without crashing', async () => {
  const harness = await createHarness()
  try {
    let savedPalette = null
    let closed = false

    await harness.render(
      React.createElement(customPaletteEditor.CustomPaletteEditor, {
        isOpen: true,
        onClose: () => { closed = true },
        customColors: theme.DEFAULT_CUSTOM_COLORS,
        onSaveAndApply: (palette) => { savedPalette = palette },
      })
    )

    // Edit a color to invalid value #zzzzzz
    const bgInput = document.querySelector('input[type="text"]')
    assert.ok(bgInput, 'Color input exists')
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(bgInput, '#zzzzzz')
      bgInput.dispatchEvent(new window.Event('input', { bubbles: true }))
      bgInput.dispatchEvent(new window.Event('change', { bubbles: true }))
    })

    // Try Save & Apply
    const saveBtn = document.querySelector('[data-testid="save-apply-palette-btn"]')
    assert.ok(saveBtn, 'Save & Apply button exists')
    await act(async () => saveBtn.click())

    // Assert: Actionable error displayed, NOT saved, editor remains OPEN
    assert.equal(savedPalette, null, 'Invalid color MUST NOT save')
    assert.equal(closed, false, 'Editor MUST stay open on validation failure')
    const errorEl = document.querySelector('[data-testid="editor-error-message"]') || document.querySelector('[role="alert"]')
    assert.ok(errorEl && errorEl.textContent.includes('expected #RRGGBB'), 'Actionable error message displayed for invalid color')

    // Now test BackupModal resilience against malformed/corrupt stored settings
    localStorage.setItem(backupSettings.SETTINGS_KEYS.customThemeColors, '{"bgHex":"#zzzzzz","textHex":"invalid"}')
    localStorage.setItem(backupSettings.SETTINGS_KEYS.factoryThemeOverrides, '{bad json')

    let backupClosed = false
    // Render BackupModal
    await harness.render(
      React.createElement(backupModal.BackupModal, {
        isOpen: true,
        onClose: () => { backupClosed = true },
        songs: [SAMPLE_SONG],
        setlists: [],
        folders: [],
        onImport: () => {},
      })
    )

    // Assert BackupModal mounts cleanly and does NOT crash React
    const backupTitle = document.querySelector('h2')
    assert.ok(backupTitle, 'BackupModal mounted successfully without crashing to empty root')

    // Verify backup payload created without throwing
    const payload = jsonBackup.createBackupPayload([SAMPLE_SONG], [], [])
    assert.equal(payload.songs.length, 1)
    assert.equal(payload.songs[0].title, SAMPLE_SONG.title)
    assert.equal(payload.customThemeColors, undefined, 'Corrupt customThemeColors isolated from backup')
    assert.equal(payload.factoryThemeOverrides, undefined, 'Corrupt factoryThemeOverrides isolated from backup')
  } finally {
    await harness.cleanup()
  }
})

// =============================================================================
// FIX 4: P2_PARTIAL_SAVE - Atomic rollback on write/quota failure
// =============================================================================
test('FIX_4: Quota failure rolls back partial writes, keeps editor open, and shows error', async () => {
  const harness = await createHarness()
  try {
    const originalSetItem = localStorage.setItem.bind(localStorage)
    const initialOverrides = { 'amber-stage': { ...theme.DEFAULT_CUSTOM_COLORS, bgHex: '#181206' } }
    localStorage.setItem(backupSettings.SETTINGS_KEYS.factoryThemeOverrides, JSON.stringify(initialOverrides))
    localStorage.setItem(backupSettings.SETTINGS_KEYS.customThemeColors, JSON.stringify(theme.DEFAULT_CUSTOM_COLORS))
    localStorage.setItem(backupSettings.SETTINGS_KEYS.themeMode, 'solarized-dark')

    let closed = false
    await harness.render(
      React.createElement(theme.ThemeModal, {
        isOpen: true,
        onClose: () => { closed = true },
        currentTheme: 'solarized-dark',
        customColors: theme.DEFAULT_CUSTOM_COLORS,
      })
    )

    const originalProtoSetItem = harness.dom.window.Storage.prototype.setItem
    harness.dom.window.Storage.prototype.setItem = function (key, val) {
      if (key === backupSettings.SETTINGS_KEYS.customThemeColors) {
        throw new Error('QuotaExceededError: storage quota exceeded')
      }
      return originalProtoSetItem.call(this, key, val)
    }

    // Attempt save in ThemeModal
    const saveBtn = document.querySelector('[data-testid="theme-save-apply-btn"]')
    assert.ok(saveBtn, 'Theme save button exists')
    await act(async () => saveBtn.click())

    // Assert: Modal stays open
    assert.equal(closed, false, 'Modal MUST NOT close on quota failure')

    // Assert: Error message is displayed
    const errorEl = document.querySelector('[data-testid="theme-save-error"]')
    assert.ok(errorEl, 'Save error banner must be present')
    assert.ok(errorEl.textContent.includes('quota'), 'Error message mentions quota or write failure')

    // Restore setItem
    harness.dom.window.Storage.prototype.setItem = originalProtoSetItem

    // Assert: factoryThemeOverrides was ROLLED BACK and NOT partially updated!
    const persistedOverrides = JSON.parse(localStorage.getItem(backupSettings.SETTINGS_KEYS.factoryThemeOverrides) || '{}')
    assert.equal(persistedOverrides['amber-stage']?.bgHex, '#181206', 'Previous factory overrides restored after rollback')
    assert.equal(localStorage.getItem(backupSettings.SETTINGS_KEYS.themeMode), 'solarized-dark', 'Theme mode preserved')
  } finally {
    await harness.cleanup()
  }
})

// =============================================================================
// FIX 5: P2_STALE_APPEARANCE - Rehydrate active appearance on restore/storage
// =============================================================================
test('FIX_5: Restore and cross-tab storage events rehydrate active appearance without loops', async () => {
  const harness = await createHarness()
  try {
    await harness.render(React.createElement(appModule.App))

    // Verify initial theme is solarized-dark
    assert.equal(document.body.dataset.theme, 'solarized-dark')

    // 1. Simulate backup restore updating localStorage and dispatching SETTINGS_CHANGED
    const restoredColors = { ...theme.DEFAULT_CUSTOM_COLORS, bgHex: '#120d0f', textHex: '#fee2e2' }
    await act(async () => {
      localStorage.setItem(backupSettings.SETTINGS_KEYS.themeMode, 'crimson-stage')
      localStorage.setItem(backupSettings.SETTINGS_KEYS.customThemeColors, JSON.stringify(restoredColors))
      window.dispatchEvent(new window.Event(backupSettings.SETTINGS_CHANGED))
    })

    // Assert: App rehydrated active appearance immediately
    assert.equal(document.body.dataset.theme, 'crimson-stage', 'App rehydrated active theme on SETTINGS_CHANGED')
    assert.equal(document.documentElement.style.getPropertyValue('--custom-stage-bg'), '#120d0f')

    // 2. Simulate cross-tab storage event
    await act(async () => {
      localStorage.setItem(backupSettings.SETTINGS_KEYS.themeMode, 'azure-stage')
      const storageEvt = new window.Event('storage')
      storageEvt.key = backupSettings.SETTINGS_KEYS.themeMode
      storageEvt.newValue = 'azure-stage'
      window.dispatchEvent(storageEvt)
    })

    // Assert: Cross-tab update applied
    assert.equal(document.body.dataset.theme, 'azure-stage', 'App rehydrated active theme on cross-tab storage event')
    assert.equal(document.documentElement.style.getPropertyValue('--custom-stage-bg'), '#0a1324')
  } finally {
    await harness.cleanup()
  }
})
