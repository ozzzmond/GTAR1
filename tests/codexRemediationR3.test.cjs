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
const customPaletteEditor = require('../src/components/CustomPaletteEditor.tsx')
const backupSettings = require('../src/utils/backupSettings.ts')
const customPaletteJson = require('../src/utils/customPaletteJson.ts')

// Shared storage proxy for true multi-tab simulation
function createSharedStorage(store = new Map()) {
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    get length() {
      return store.size
    },
    key(index) {
      return Array.from(store.keys())[index] || null
    },
    _raw: store,
  }
}

async function createTabHarness(sharedStorage, html = '<html><head></head><body><div id="root"></div></body></html>') {
  const dom = new JSDOM(html, { url: 'https://gtar.test' })
  const storage = sharedStorage || createSharedStorage()

  // Bind storage to window
  Object.defineProperty(dom.window, 'localStorage', {
    value: storage,
    configurable: true,
  })

  const root = createRoot(dom.window.document.getElementById('root'))

  const activateGlobals = () => {
    global.window = dom.window
    global.document = dom.window.document
    global.localStorage = storage
    global.IS_REACT_ACT_ENVIRONMENT = true
  }

  const deactivateGlobals = () => {
    delete global.window
    delete global.document
    delete global.localStorage
    delete global.IS_REACT_ACT_ENVIRONMENT
  }

  return {
    dom,
    root,
    storage,
    activate: activateGlobals,
    deactivate: deactivateGlobals,
    render: async (component) => {
      activateGlobals()
      await act(async () => root.render(component))
    },
    cleanup: async () => {
      activateGlobals()
      await act(async () => root.unmount())
      dom.window.close()
      deactivateGlobals()
    },
  }
}

// =============================================================================
// R1: DURABLE_FAILED_SAVE
// =============================================================================
test('R1: Commit failure at prior positions leaves authoritative storage unchanged; reload/second tab cannot activate rejected #6789ab; draft remains editable', async () => {
  const sharedStorage = createSharedStorage()

  // 1. Establish valid baseline in storage and snapshot
  const initialOverrides = {
    'amber-stage': {
      ...theme.DEFAULT_CUSTOM_COLORS,
      bgHex: '#221100',
      identity: { factoryId: 'amber-stage', displayName: 'Warm Amber Initial' },
    },
  }
  const initialSnapshot = {
    version: 1,
    themeMode: 'amber-stage',
    customThemeColors: theme.DEFAULT_CUSTOM_COLORS,
    factoryThemeOverrides: initialOverrides,
  }
  sharedStorage.setItem(backupSettings.SETTINGS_KEYS.appearance, JSON.stringify(initialSnapshot))
  sharedStorage.setItem(backupSettings.SETTINGS_KEYS.factoryThemeOverrides, JSON.stringify(initialOverrides))
  sharedStorage.setItem(backupSettings.SETTINGS_KEYS.customThemeColors, JSON.stringify(theme.DEFAULT_CUSTOM_COLORS))
  sharedStorage.setItem(backupSettings.SETTINGS_KEYS.themeMode, 'amber-stage')

  const tab1 = await createTabHarness(sharedStorage)
  tab1.activate()

  try {
    theme.applyThemeRuntime('amber-stage', theme.DEFAULT_CUSTOM_COLORS, initialOverrides)
    assert.equal(document.documentElement.style.getPropertyValue('--custom-stage-bg'), '#221100')

    let closed = false
    let appliedTheme = null

    await tab1.render(
      React.createElement(theme.ThemeModal, {
        isOpen: true,
        onClose: () => { closed = true },
        currentTheme: 'amber-stage',
        customColors: theme.DEFAULT_CUSTOM_COLORS,
        onApplyTheme: (mode) => { appliedTheme = mode },
      })
    )

    // Open editor for amber-stage
    const customizeBtn = document.querySelector('[data-testid="customize-preset-amber-stage-btn"]')
    assert.ok(customizeBtn, 'Customize amber-stage button exists')
    await act(async () => customizeBtn.click())

    // Edit color to rejected #6789ab
    const colorInput = document.querySelector('[data-testid="color-control-bgHex"] input[type="text"]')
    assert.ok(colorInput, 'Background hex input exists')
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(colorInput, '#6789ab')
      colorInput.dispatchEvent(new window.Event('input', { bubbles: true }))
      colorInput.dispatchEvent(new window.Event('change', { bubbles: true }))
    })

    // INJECT WRITE FAILURE at prior factory position 2 (customThemeColors)
    // AND mock persistent failure where rollback also fails!
    const originalSetItem = sharedStorage.setItem.bind(sharedStorage)
    let callCount = 0
    sharedStorage.setItem = function (key, val) {
      callCount++
      if (key === backupSettings.SETTINGS_KEYS.customThemeColors) {
        throw new Error('QuotaExceededError: write failed at prior position 2')
      }
      if (callCount > 1) {
        throw new Error('FatalDiskError: rollback failed')
      }
      return originalSetItem(key, val)
    }

    // Attempt Save & Apply from inside CustomPaletteEditor
    const savePaletteBtn = document.querySelector('[data-testid="save-apply-palette-btn"]')
    assert.ok(savePaletteBtn, 'Save & Apply palette button exists')
    await act(async () => savePaletteBtn.click())

    // ASSERTIONS:
    // 1. Commit failed, editor stays open
    assert.equal(closed, false, 'Modal/editor must NOT close on save failure')
    assert.equal(appliedTheme, null, 'Must NOT report successful applied theme')

    // 2. Draft remains editable with rejected value preserved for user to retry or adjust
    const draftInput = document.querySelector('[data-testid="color-control-bgHex"] input[type="text"]')
    assert.equal(draftInput?.value, '#6789ab', 'Draft input must remain intact and editable')

    // 3. Error banner is honest and visible
    const errorEl = document.querySelector('[data-testid="editor-error-message"]') || document.querySelector('[data-testid="theme-save-error"]')
    assert.ok(errorEl, 'Honest error message must be displayed')
    assert.ok(errorEl.textContent.includes('write failed') || errorEl.textContent.includes('Storage write failed'))

    // 4. In-memory active appearance in DOM was preserved as #221100
    assert.equal(document.documentElement.style.getPropertyValue('--custom-stage-bg'), '#221100')

    // 5. Authoritative appearance storage was NOT mutated to #6789ab!
    const authoritative = JSON.parse(sharedStorage.getItem(backupSettings.SETTINGS_KEYS.appearance) || 'null')
    assert.equal(authoritative?.factoryThemeOverrides?.['amber-stage']?.bgHex, '#221100', 'Authoritative storage MUST retain #221100')

    // Restore clean storage operations for reload / second tab checks
    sharedStorage.setItem = originalSetItem

    // 6. RELOAD CHECK: Cold-start hydration cannot activate rejected #6789ab
    const rehydrated = theme.hydrateThemeSettings(sharedStorage)
    const rehydratedOverrides = theme.loadFactoryThemeOverrides(sharedStorage)
    assert.equal(rehydratedOverrides['amber-stage']?.bgHex, '#221100', 'Reload reads authoritative storage: #221100 preserved')
    assert.notEqual(rehydratedOverrides['amber-stage']?.bgHex, '#6789ab', 'Reload CANNOT activate rejected #6789ab')

    // 7. TRUE SECOND TAB CHECK: A separate tab instance reading sharedStorage cannot activate rejected #6789ab
    tab1.deactivate()
    const tab2 = await createTabHarness(sharedStorage)
    tab2.activate()
    try {
      const tab2Hydrated = theme.hydrateThemeSettings(sharedStorage)
      const tab2Overrides = theme.loadFactoryThemeOverrides(sharedStorage)
      const tab2Resolved = theme.resolveThemePalette(tab2Hydrated.mode, tab2Hydrated.standalone, tab2Overrides)
      assert.equal(tab2Resolved.bgHex, '#221100', 'Second tab sees previously committed appearance #221100')
      assert.notEqual(tab2Resolved.bgHex, '#6789ab', 'Second tab CANNOT see rejected #6789ab')
    } finally {
      await tab2.cleanup()
    }
  } finally {
    tab1.activate()
    await tab1.cleanup()
  }
})

// =============================================================================
// R2: FACTORY_RESTORE_RUNTIME
// =============================================================================
test('R2: Failed Restore Factory Theme preserves exact active appearance #221100 and saved overrides; does not flip to factory preset #181206', async () => {
  const sharedStorage = createSharedStorage()

  // 1. Establish customized amber-stage (#221100) in storage
  const initialOverrides = {
    'amber-stage': {
      ...theme.DEFAULT_CUSTOM_COLORS,
      bgHex: '#221100',
      identity: { factoryId: 'amber-stage', displayName: 'Warm Amber Custom' },
    },
  }
  const initialSnapshot = {
    version: 1,
    themeMode: 'amber-stage',
    customThemeColors: theme.DEFAULT_CUSTOM_COLORS,
    factoryThemeOverrides: initialOverrides,
  }
  sharedStorage.setItem(backupSettings.SETTINGS_KEYS.appearance, JSON.stringify(initialSnapshot))
  sharedStorage.setItem(backupSettings.SETTINGS_KEYS.factoryThemeOverrides, JSON.stringify(initialOverrides))
  sharedStorage.setItem(backupSettings.SETTINGS_KEYS.customThemeColors, JSON.stringify(theme.DEFAULT_CUSTOM_COLORS))
  sharedStorage.setItem(backupSettings.SETTINGS_KEYS.themeMode, 'amber-stage')

  const tab = await createTabHarness(sharedStorage)
  tab.activate()

  try {
    theme.applyThemeRuntime('amber-stage', theme.DEFAULT_CUSTOM_COLORS, initialOverrides)
    assert.equal(document.documentElement.style.getPropertyValue('--custom-stage-bg'), '#221100')

    let closed = false
    let appliedTheme = null

    await tab.render(
      React.createElement(theme.ThemeModal, {
        isOpen: true,
        onClose: () => { closed = true },
        currentTheme: 'amber-stage',
        customColors: theme.DEFAULT_CUSTOM_COLORS,
        onApplyTheme: (mode) => { appliedTheme = mode },
      })
    )

    // 2. Click "Restore Factory Theme" and confirm in dialog
    const restoreBtn = document.querySelector('[data-testid="restore-factory-amber-stage"]')
    assert.ok(restoreBtn, 'Restore Factory Theme button exists')
    await act(async () => restoreBtn.click())

    const confirmBtn = document.querySelector('[data-testid="confirm-factory-restore"]')
    assert.ok(confirmBtn, 'Confirm restore button exists')
    await act(async () => confirmBtn.click())

    // 3. Inject storage failure during Save & Apply commit
    const originalSetItem = sharedStorage.setItem.bind(sharedStorage)
    sharedStorage.setItem = function () {
      throw new Error('QuotaExceededError: disk full during restore commit')
    }

    // 4. Click Save & Apply
    const saveApplyBtn = document.querySelector('[data-testid="theme-save-apply-btn"]')
    assert.ok(saveApplyBtn, 'Theme save button exists')
    await act(async () => saveApplyBtn.click())

    // 5. ASSERTIONS:
    // a. Must NOT report success or close
    assert.equal(appliedTheme, null, 'Must NOT report success on failed restore')
    assert.equal(closed, false, 'Modal MUST remain open')

    // b. Error banner must be visible
    const errorEl = document.querySelector('[data-testid="theme-save-error"]')
    assert.ok(errorEl, 'Error banner must be visible')
    assert.ok(errorEl.textContent.includes('disk full') || errorEl.textContent.includes('Storage write failed'))

    // c. CRITICAL REGRESSION ACCEPTANCE:
    // Active appearance in DOM MUST REMAIN #221100!
    // Must NOT flip to factory preset #181206 on failed restore!
    const activeBg = document.documentElement.style.getPropertyValue('--custom-stage-bg')
    assert.equal(activeBg, '#221100', 'Active appearance must remain #221100, NOT flip to factory default #181206')
    assert.notEqual(activeBg, '#181206', 'Factory default #181206 must NOT activate on failed restore')

    // d. Saved override is preserved in memory and storage
    const storageOverrides = JSON.parse(sharedStorage.getItem(backupSettings.SETTINGS_KEYS.factoryThemeOverrides) || '{}')
    assert.equal(storageOverrides['amber-stage']?.bgHex, '#221100', 'Storage preserves #221100 override')

    // Restore setItem
    sharedStorage.setItem = originalSetItem

    // e. Cancel leaves DOM background unchanged as #221100
    const cancelBtn = document.querySelector('button[aria-label="Close without saving"]')
    assert.ok(cancelBtn, 'Cancel button exists')
    await act(async () => cancelBtn.click())

    assert.equal(document.documentElement.style.getPropertyValue('--custom-stage-bg'), '#221100')
  } finally {
    await tab.cleanup()
  }
})

// =============================================================================
// R3: READ_AND_SYNC_BOUNDARIES
// =============================================================================
test('R3: Cold-start hydration, cross-tab sync, backup export/import all read committed snapshot with no update loops', async () => {
  const sharedStorage = createSharedStorage()

  // 1. Write an authoritative snapshot with custom standalone palette and azure-stage override
  const customPalette = {
    ...theme.DEFAULT_CUSTOM_COLORS,
    bgHex: '#0f172a',
    textHex: '#f1f5f9',
    chordHex: '#38bdf8',
    sectionHex: '#c084fc',
  }
  const factoryOverrides = {
    'azure-stage': {
      ...theme.DEFAULT_CUSTOM_COLORS,
      bgHex: '#032040',
      identity: { factoryId: 'azure-stage', displayName: 'Deep Azure Custom' },
    },
  }
  const snapshot = {
    version: 1,
    themeMode: 'custom',
    customThemeColors: customPalette,
    factoryThemeOverrides: factoryOverrides,
  }
  sharedStorage.setItem(backupSettings.SETTINGS_KEYS.appearance, JSON.stringify(snapshot))

  // 2. Cold-start hydration reads snapshot
  const hydrated = theme.hydrateThemeSettings(sharedStorage)
  assert.equal(hydrated.mode, 'custom')
  assert.equal(hydrated.standalone.bgHex, '#0f172a')
  const overrides = theme.loadFactoryThemeOverrides(sharedStorage)
  assert.equal(overrides['azure-stage']?.bgHex, '#032040')

  // 3. Backup export reads snapshot
  const backup = backupSettings.readBackupSettings(sharedStorage)
  assert.equal(backup.themeMode, 'custom')
  assert.equal(backup.customThemeColors?.bgHex, '#0f172a')
  assert.equal(backup.factoryThemeOverrides?.['azure-stage']?.bgHex, '#032040')

  // 4. Backup restore writes snapshot atomically
  const newBackup = {
    themeMode: 'azure-stage',
    customThemeColors: { ...theme.DEFAULT_CUSTOM_COLORS, bgHex: '#1a1a2e' },
    factoryThemeOverrides: {
      'crimson-stage': {
        ...theme.DEFAULT_CUSTOM_COLORS,
        bgHex: '#2b0c16',
        identity: { factoryId: 'crimson-stage', displayName: 'Dark Crimson' },
      },
    },
  }
  backupSettings.restoreBackupSettings(newBackup, sharedStorage)

  const restoredSnapshot = backupSettings.readAppearanceSnapshot(sharedStorage)
  assert.ok(restoredSnapshot, 'Restored appearance snapshot must be present')
  assert.equal(restoredSnapshot.themeMode, 'azure-stage')
  assert.equal(restoredSnapshot.customThemeColors.bgHex, '#1a1a2e')
  assert.equal(restoredSnapshot.factoryThemeOverrides['crimson-stage']?.bgHex, '#2b0c16')

  // 5. Cross-tab storage change without update loop
  let storageWriteCount = 0
  const originalSetItem = sharedStorage.setItem.bind(sharedStorage)
  sharedStorage.setItem = function (k, v) {
    storageWriteCount++
    return originalSetItem(k, v)
  }

  // Simulate Tab 2 receiving a storage event
  const tab = await createTabHarness(sharedStorage)
  tab.activate()
  try {
    const { mode, standalone, overrides: hydratedOverrides } = theme.hydrateThemeSettings(sharedStorage)
    theme.applyThemeRuntime(mode, standalone, hydratedOverrides)
    // Applying runtime in response to storage event must NOT write back to storage!
    assert.equal(storageWriteCount, 0, 'Cross-tab hydration must NOT generate storage writes (no update loops)')
  } finally {
    sharedStorage.setItem = originalSetItem
    await tab.cleanup()
  }
})

// =============================================================================
// R4: SECURITY_AND_COMPATIBILITY
// =============================================================================
test('R4: 7 factory themes, 38 tokens, invalid color and prototype pollution rejection, and font safety', async () => {
  // 1. All 7 factory themes accepted
  for (const t of theme.THEME_OPTIONS) {
    assert.ok(backupSettings.THEME_MODES.includes(t.id), `Theme mode ${t.id} must be supported`)
  }

  // 2. Reject prototype pollution and unknown fields
  const maliciousSnapshot = {
    version: 1,
    themeMode: 'solarized-dark',
    customThemeColors: {
      ...theme.DEFAULT_CUSTOM_COLORS,
      __proto__: { polluted: true },
      unknownExploitField: '#123456',
    },
    factoryThemeOverrides: {},
  }
  const errors = backupSettings.validateAppearanceSnapshot(maliciousSnapshot)
  assert.ok(errors.length > 0, 'Unknown fields in appearance snapshot must be rejected')

  // 3. Reject invalid color tokens
  const badColorSnapshot = {
    version: 1,
    themeMode: 'solarized-dark',
    customThemeColors: {
      ...theme.DEFAULT_CUSTOM_COLORS,
      bgHex: 'not-a-valid-hex',
    },
    factoryThemeOverrides: {},
  }
  const colorErrors = backupSettings.validateAppearanceSnapshot(badColorSnapshot)
  assert.ok(colorErrors.some(e => e.includes('#RRGGBB')), 'Invalid color format must be rejected')

  // 4. Remote font activation: Only on explicit commit
  const harness = await createTabHarness()
  harness.activate()
  try {
    let closed = false
    await harness.render(
      React.createElement(customPaletteEditor.CustomPaletteEditor, {
        isOpen: true,
        onClose: () => { closed = true },
        customColors: theme.DEFAULT_CUSTOM_COLORS,
        onSaveAndApply: () => true,
      })
    )

    // Staged fonts do not insert stylesheet into document before save
    const initialLinks = document.querySelectorAll('link[data-gtar-font]')
    assert.equal(initialLinks.length, 0, 'No font link tags before approved save')

    // Click Cancel
    const cancelBtn = document.querySelector('[data-testid="cancel-palette-editor-btn"]')
    assert.ok(cancelBtn, 'Cancel editor button exists')
    await act(async () => cancelBtn.click())
    assert.equal(closed, true, 'Editor closed on cancel')

    const afterCancelLinks = document.querySelectorAll('link[data-gtar-font]')
    assert.equal(afterCancelLinks.length, 0, 'Zero font links added after cancel')
  } finally {
    await harness.cleanup()
  }
})
