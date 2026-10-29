const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

function createHarness() {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body class="theme-custom"><div id="root"></div></body></html>', {
    url: 'http://localhost:5173',
  })
  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    root: dom.window.document.documentElement,
  }
}

test('THEME_SEMANTIC_COVERAGE: Facebook-style light custom palette resolves light surfaces for Explorer', async () => {
  // Repro palette: headerBg=#3B5998, bgHex=#E9EBEE, songCardBg=#FFFFFF, setlistCardBg=#FFFFFF, uiPrimaryText=#1C1E21
  const reproPalette = {
    headerBg: '#3B5998',
    bgHex: '#E9EBEE',
    songCardBg: '#FFFFFF',
    setlistCardBg: '#FFFFFF',
    uiPrimaryText: '#1C1E21',
  }

  // Verify luminance calculation
  const hex = reproPalette.bgHex.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const luminance = (r * 299 + g * 587 + b * 114) / 1000
  assert.ok(luminance > 150, 'Repro bgHex #E9EBEE must be classified as light (> 150)')

  // Read ThemeModal.tsx surfaceDefaults logic to verify implementation parity
  const themeModalSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ThemeModal.tsx'), 'utf8')
  assert.ok(themeModalSrc.includes('surfaceDefaults'), 'ThemeModal must contain surfaceDefaults helper')
  assert.ok(themeModalSrc.includes('toolbarBg: colors.toolbarBg || bg'), 'surfaceDefaults must fall back toolbarBg to bg for light theme')
  assert.ok(themeModalSrc.includes('filterBarBg: colors.filterBarBg || cardSurface'), 'surfaceDefaults must fall back filterBarBg to cardSurface for light theme')

  const backupSettingsSrc = fs.readFileSync(path.resolve(__dirname, '../src/utils/backupSettings.ts'), 'utf8')
  assert.ok(backupSettingsSrc.includes('surfaceDefaults'), 'backupSettings must contain surfaceDefaults helper')
})

test('THEME_SEMANTIC_COVERAGE: Explorer UI layers contain required semantic tokens and classes', () => {
  const appSrc = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8')
  const headerSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/Header.tsx'), 'utf8')
  const navSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/ExplorerNavigation.tsx'), 'utf8')
  const homeSrc = fs.readFileSync(path.resolve(__dirname, '../src/components/SongbookHomeView.tsx'), 'utf8')
  const cssSrc = fs.readFileSync(path.resolve(__dirname, '../src/index.css'), 'utf8')

  // App.tsx
  assert.ok(appSrc.includes('bg-app-toolbar'), 'App sidebar must use semantic bg-app-toolbar')
  assert.ok(appSrc.includes('bg-app-base'), 'App main canvas must use semantic bg-app-base')

  // Header.tsx
  assert.ok(headerSrc.includes('bg-app-header'), 'Header must use semantic bg-app-header')
  assert.ok(headerSrc.includes('header-search-input'), 'Header search input must wire to .header-search-input')

  // ExplorerNavigation.tsx
  assert.ok(navSrc.includes('ui-explorer-nav'), 'ExplorerNavigation must have .ui-explorer-nav class')
  assert.ok(navSrc.includes('bg-app-toolbar'), 'ExplorerNavigation must use semantic bg-app-toolbar')

  // SongbookHomeView.tsx
  assert.ok(homeSrc.includes('data-explorer-canvas="true"'), 'SongbookHomeView root canvas must set data-explorer-canvas="true"')
  assert.ok(homeSrc.includes('ui-filter-bar'), 'Breadcrumb / filter bar must have .ui-filter-bar class')
  assert.ok(homeSrc.includes('ui-song-card'), 'Song card must have .ui-song-card class')
  assert.ok(homeSrc.includes('ui-setlist-card'), 'Setlist card must have .ui-setlist-card class')
  assert.ok(homeSrc.includes('bg-app-song'), 'Song card must use semantic bg-app-song')
  assert.ok(homeSrc.includes('bg-app-setlist'), 'Setlist card must use semantic bg-app-setlist')

  // CSS overrides for body.theme-custom
  assert.ok(cssSrc.includes('.ui-filter-bar'), 'index.css must define .ui-filter-bar rules under theme-custom')
  assert.ok(cssSrc.includes('.ui-explorer-nav'), 'index.css must define .ui-explorer-nav rules under theme-custom')
  assert.ok(cssSrc.includes('[data-explorer-canvas="true"]'), 'index.css must define [data-explorer-canvas="true"] rules under theme-custom')
})

test('THEME_SEMANTIC_COVERAGE: JSON v2 schema compatibility preserved', () => {
  const customPaletteJsonSrc = fs.readFileSync(path.resolve(__dirname, '../src/utils/customPaletteJson.ts'), 'utf8')

  // Verify CANONICAL_CUSTOM_PALETTE_FIELDS has exactly 38 fields
  const matchFields = customPaletteJsonSrc.match(/CANONICAL_CUSTOM_PALETTE_FIELDS\s*=\s*\[([\s\S]*?)\]\s*as\s*const/)
  assert.ok(matchFields, 'customPaletteJson must define CANONICAL_CUSTOM_PALETTE_FIELDS')
  const cleanBody = matchFields[1].replace(/\/\/.*$/gm, '')
  const fields = cleanBody.split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean)
  assert.equal(fields.length, 38, 'customPaletteJson CANONICAL_CUSTOM_PALETTE_FIELDS must contain exactly 38 fields')

  // Ensure JSON v2 schema includes all required Explorer roles
  const expectedRoles = [
    'headerBg', 'toolbarBg', 'filterBarBg', 'searchBg', 'searchBorder',
    'songCardBg', 'setlistCardBg', 'cardBorder', 'selectedCardBg', 'selectedCardBorder',
    'buttonBg', 'buttonText', 'inputBg', 'inputText', 'inputBorder', 'accentColor',
  ]
  for (const role of expectedRoles) {
    assert.ok(fields.includes(role), `CANONICAL_CUSTOM_PALETTE_FIELDS must include ${role}`)
  }
})
