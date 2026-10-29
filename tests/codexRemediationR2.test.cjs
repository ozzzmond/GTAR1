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
// FIX 1: STANDALONE_JSON_IMPORT
// =============================================================================
test('FIX_1: Standalone JSON import and save preserves valid identity and rejects malformed payloads', async () => {
  const harness = await createHarness()
  try {
    let savedPalette = null
    let closed = false

    // 1. Mount CustomPaletteEditor with standalone colors (no identity)
    await harness.render(
      React.createElement(customPaletteEditor.CustomPaletteEditor, {
        isOpen: true,
        onClose: () => { closed = true },
        customColors: theme.DEFAULT_CUSTOM_COLORS,
        onSaveAndApply: (palette) => { savedPalette = palette },
      })
    )

    // 2. Open import modal
    const importBtn = document.querySelector('[data-testid="import-palette-btn"]')
    assert.ok(importBtn, 'Import JSON button exists')
    await act(async () => importBtn.click())

    // 3. Import valid standalone gtar-custom-palette v2 JSON
    const standaloneJson = {
      format: 'gtar-custom-palette',
      version: 2,
      colors: {
        ...theme.DEFAULT_CUSTOM_COLORS,
        bgHex: '#141a22',
        textHex: '#f8fafc',
      },
    }
    delete standaloneJson.colors.identity
    delete standaloneJson.colors.fonts

    const textarea = document.querySelector('[data-testid="palette-json-textarea"]')
    assert.ok(textarea, 'JSON textarea exists')
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      nativeSetter.call(textarea, JSON.stringify(standaloneJson))
      textarea.dispatchEvent(new window.Event('input', { bubbles: true }))
      textarea.dispatchEvent(new window.Event('change', { bubbles: true }))
    })

    const applyImportBtn = document.querySelector('[data-testid="apply-import-json-btn"]')
    assert.ok(applyImportBtn, 'Apply import button exists')
    await act(async () => applyImportBtn.click())

    // Fast-forward import preview timeout
    await act(async () => {
      await new Promise((r) => setTimeout(r, 850))
    })

    // 4. Click Save & Apply - MUST NOT reject with "Theme identity must be an object"!
    const saveBtn = document.querySelector('[data-testid="save-apply-palette-btn"]')
    assert.ok(saveBtn, 'Save & Apply button exists')
    await act(async () => saveBtn.click())

    assert.equal(closed, true, 'Editor must close on successful Save & Apply')
    assert.ok(savedPalette, 'Saved palette must be committed')
    assert.equal(savedPalette.bgHex, '#141a22', 'Imported bgHex committed')
    assert.equal(savedPalette.identity, undefined, 'Standalone import must not carry identity')

    // 5. Verify malformed payloads are rejected:
    // a. Malformed identity
    const badIdentityJson = {
      format: 'gtar-custom-palette',
      version: 2,
      identity: { factoryId: 'non-existent-theme', displayName: 'Bad' },
      colors: { ...theme.DEFAULT_CUSTOM_COLORS },
    }
    const importBadIdResult = customPaletteJson.importCustomPaletteJson(badIdentityJson)
    assert.equal(importBadIdResult.success, false, 'Invalid factory slot rejected')
    assert.ok(importBadIdResult.error.includes('Unsupported factory theme'))

    // b. Malformed color hex
    const badColorJson = {
      format: 'gtar-custom-palette',
      version: 2,
      colors: { ...theme.DEFAULT_CUSTOM_COLORS, bgHex: 'not-a-hex' },
    }
    const importBadColorResult = customPaletteJson.importCustomPaletteJson(badColorJson)
    assert.equal(importBadColorResult.success, false, 'Invalid hex color rejected')
    assert.ok(importBadColorResult.error.includes('#RRGGBB'))

    // c. Prototype pollution / unknown keys in colors
    const badKeysJson = {
      format: 'gtar-custom-palette',
      version: 2,
      colors: { ...theme.DEFAULT_CUSTOM_COLORS, maliciousKey: '#123456' },
    }
    const importBadKeysResult = customPaletteJson.importCustomPaletteJson(badKeysJson)
    assert.equal(importBadKeysResult.success, false, 'Unknown color key rejected')

    // 6. Test custom-vs-factory override ownership and identity on export/reimport
    // Export standalone:
    const exportedStandalone = customPaletteJson.exportCustomPaletteJson(savedPalette)
    assert.equal(exportedStandalone.identity, undefined, 'Exported standalone palette has no identity')

    // Export factory override:
    const factoryPalette = {
      ...theme.DEFAULT_CUSTOM_COLORS,
      identity: { factoryId: 'amber-stage', displayName: 'Amber Custom 1' },
    }
    const exportedFactory = customPaletteJson.exportCustomPaletteJson(factoryPalette)
    assert.deepEqual(exportedFactory.identity, { factoryId: 'amber-stage', displayName: 'Amber Custom 1' })

    // Reimporting factory palette parses valid identity
    const reimportedFactory = customPaletteJson.importCustomPaletteJson(exportedFactory)
    assert.equal(reimportedFactory.success, true)
    assert.deepEqual(reimportedFactory.colors.identity, { factoryId: 'amber-stage', displayName: 'Amber Custom 1' })
  } finally {
    await harness.cleanup()
  }
})

// =============================================================================
// FIX 2: NESTED_EDITOR_SAVE_FAILURE
// =============================================================================
test('FIX_2: Nested editor propagates save failure, keeps draft and inputs open, and shows actionable error', async () => {
  const harness = await createHarness()
  try {
    let themeModalClosed = false
    let selectedTheme = null

    // 1. Render ThemeModal
    await harness.render(
      React.createElement(theme.ThemeModal, {
        isOpen: true,
        onClose: () => { themeModalClosed = true },
        currentTheme: 'solarized-dark',
        customColors: theme.DEFAULT_CUSTOM_COLORS,
        onSelectTheme: (t) => { selectedTheme = t },
      })
    )

    // 2. Open CustomPaletteEditor from inside ThemeModal
    const openEditorBtn = document.querySelector('[data-testid="open-custom-palette-editor-btn"]')
    assert.ok(openEditorBtn, 'Open palette editor button exists')
    await act(async () => openEditorBtn.click())

    const editorWindow = document.querySelector('[data-testid="custom-palette-editor-window"]')
    assert.ok(editorWindow, 'CustomPaletteEditor is open')

    // 3. Modify a color input in draft (e.g. #334455)
    const colorInput = document.querySelector('input[type="text"]')
    assert.ok(colorInput, 'Color input exists')
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(colorInput, '#334455')
      colorInput.dispatchEvent(new window.Event('input', { bubbles: true }))
      colorInput.dispatchEvent(new window.Event('change', { bubbles: true }))
    })

    // 4. Inject appearance save failure during commit
    const originalProtoSetItem = harness.dom.window.Storage.prototype.setItem
    harness.dom.window.Storage.prototype.setItem = function (key, val) {
      if (key === backupSettings.SETTINGS_KEYS.customThemeColors) {
        throw new Error('QuotaExceededError: storage full')
      }
      return originalProtoSetItem.call(this, key, val)
    }

    // 5. Click Save & Apply inside nested editor
    const saveApplyBtn = document.querySelector('[data-testid="save-apply-palette-btn"]')
    assert.ok(saveApplyBtn, 'Save & Apply button exists')
    await act(async () => saveApplyBtn.click())

    // 6. Assert nested editor did NOT close!
    const editorStillOpen = document.querySelector('[data-testid="custom-palette-editor-window"]')
    assert.ok(editorStillOpen, 'Nested CustomPaletteEditor MUST stay open on save failure')

    // 7. Assert user inputs and draft are kept intact
    const currentInput = document.querySelector('input[type="text"]')
    assert.equal(currentInput.value, '#334455', 'Draft input values MUST be preserved')

    // 8. Assert actionable error message is displayed in nested editor
    const errorEl = document.querySelector('[data-testid="editor-error-message"]')
    assert.ok(errorEl, 'Editor error banner must be present')
    assert.ok(
      errorEl.textContent.includes('storage full') || errorEl.textContent.includes('Storage write failed'),
      'Actionable error shown: ' + errorEl.textContent
    )

    // 9. Restore setItem and verify Cancel leaves saved state unchanged
    harness.dom.window.Storage.prototype.setItem = originalProtoSetItem

    const cancelBtn = document.querySelector('[data-testid="cancel-palette-editor-btn"]')
    assert.ok(cancelBtn, 'Cancel button exists')
    await act(async () => cancelBtn.click())

    // Editor closed on cancel
    const editorClosed = document.querySelector('[data-testid="custom-palette-editor-window"]')
    assert.equal(editorClosed, null, 'Editor closes on Cancel')

    // Saved state in storage unchanged
    const savedCustomColors = JSON.parse(localStorage.getItem(backupSettings.SETTINGS_KEYS.customThemeColors) || 'null')
    assert.notEqual(savedCustomColors?.bgHex, '#334455', 'Unsaved draft was not written to storage')
  } finally {
    await harness.cleanup()
  }
})

// =============================================================================
// FIX 3: ROLLBACK_FAILURE
// =============================================================================
test('FIX_3: Persistent storage failure during both commit and rollback preserves previous in-memory appearance and warns with recovery message', async () => {
  const harness = await createHarness()
  try {
    // 1. Setup clean baseline storage and active appearance
    const initialOverrides = { 'amber-stage': { ...theme.DEFAULT_CUSTOM_COLORS, bgHex: '#181206' } }
    localStorage.setItem(backupSettings.SETTINGS_KEYS.factoryThemeOverrides, JSON.stringify(initialOverrides))
    localStorage.setItem(backupSettings.SETTINGS_KEYS.customThemeColors, JSON.stringify(theme.DEFAULT_CUSTOM_COLORS))
    localStorage.setItem(backupSettings.SETTINGS_KEYS.themeMode, 'solarized-dark')

    // Apply baseline runtime
    theme.applyThemeRuntime('solarized-dark', theme.DEFAULT_CUSTOM_COLORS, initialOverrides)
    assert.equal(document.body.dataset.theme, 'solarized-dark')

    let closed = false
    let appliedTheme = null
    await harness.render(
      React.createElement(theme.ThemeModal, {
        isOpen: true,
        onClose: () => { closed = true },
        currentTheme: 'solarized-dark',
        customColors: theme.DEFAULT_CUSTOM_COLORS,
        onApplyTheme: (mode) => { appliedTheme = mode },
      })
    )

    // 2. Mock storage failure during BOTH commit AND rollback:
    // Write to factoryThemeOverrides succeeds once, but customThemeColors fails;
    // and subsequent writes during rollback fail as well!
    const originalProtoSetItem = harness.dom.window.Storage.prototype.setItem
    let setItemCallCount = 0

    harness.dom.window.Storage.prototype.setItem = function (key, val) {
      setItemCallCount++
      if (key === backupSettings.SETTINGS_KEYS.customThemeColors) {
        throw new Error('QuotaExceededError: write failed')
      }
      if (setItemCallCount > 1) {
        // Rollback attempts also fail
        throw new Error('FatalDiskError: storage hardware unwriteable')
      }
      return originalProtoSetItem.call(this, key, val)
    }

    // 3. Attempt Save & Apply from ThemeModal
    const saveBtn = document.querySelector('[data-testid="theme-save-apply-btn"]')
    assert.ok(saveBtn, 'Theme save button exists')
    await act(async () => saveBtn.click())

    // 4. Assertions:
    // a. Never report success
    assert.equal(appliedTheme, null, 'Must NEVER report success when commit/rollback fails')
    assert.equal(closed, false, 'Editor/modal must remain open')

    // b. Runtime safety: Do NOT activate failed/partial palette; preserve previous in-memory appearance
    assert.equal(document.body.dataset.theme, 'solarized-dark', 'Active DOM dataset theme must remain solarized-dark')

    // c. Fail closed with explicit recovery warning
    const errorEl = document.querySelector('[data-testid="theme-save-error"]')
    assert.ok(errorEl, 'Save error banner must be present')
    const errorText = errorEl.textContent
    assert.ok(
      errorText.includes('rollback could not be completed') || errorText.includes('recovery is incomplete'),
      'Explicit recovery warning shown: ' + errorText
    )
    assert.ok(!errorText.includes('Changes were rolled back.'), 'Must NOT claim changes were rolled back when rollback failed')

    // Restore setItem
    harness.dom.window.Storage.prototype.setItem = originalProtoSetItem
  } finally {
    await harness.cleanup()
  }
})
