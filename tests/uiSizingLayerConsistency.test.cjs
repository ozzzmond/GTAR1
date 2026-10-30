const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')

test('UI_SIZING_AND_BOX_RULES: index.css defines universal box-sizing and reusable modal classes', () => {
  const css = fs.readFileSync(path.join(projectRoot, 'src/index.css'), 'utf8')

  assert.ok(
    css.includes('box-sizing: border-box'),
    'index.css must enforce universal box-sizing: border-box'
  )
  assert.ok(
    css.includes('.modal-dialog-compact') && css.includes('max-width: 28rem'),
    'index.css must define .modal-dialog-compact'
  )
  assert.ok(
    css.includes('.modal-dialog-wide') && css.includes('max-width: 56rem'),
    'index.css must define .modal-dialog-wide'
  )
  assert.ok(
    css.includes('.modal-dialog-medium') && css.includes('max-width: 42rem'),
    'index.css must define .modal-dialog-medium'
  )
  assert.ok(
    css.includes('.modal-scroll-body') && css.includes('overscroll-behavior: contain'),
    'index.css must define .modal-scroll-body with overscroll containment'
  )
})

test('DROPDOWN_PORTAL_STACKING: default z-index positions portals above header and below modals', () => {
  const portalSrc = fs.readFileSync(path.join(projectRoot, 'src/components/DropdownPortal.tsx'), 'utf8')

  assert.match(
    portalSrc,
    /zIndex\s*=\s*45/,
    'DropdownPortal must default to z-index 45 (above header 40, below modals 50+)'
  )
})

test('LOCAL_PROFILE_MODAL_SIZING: compact form dialog with scroll containment, focus trap, and escape handling', () => {
  const modalSrc = fs.readFileSync(path.join(projectRoot, 'src/components/LocalProfileModal.tsx'), 'utf8')

  assert.ok(modalSrc.includes('max-w-md'), 'LocalProfileModal must be compact (max-w-md)')
  assert.ok(modalSrc.includes('max-h-[90dvh]'), 'LocalProfileModal must use dynamic viewport limit (max-h-[90dvh])')
  assert.ok(modalSrc.includes('overscroll-contain'), 'LocalProfileModal must declare overscroll-contain')
  assert.ok(modalSrc.includes("e.key === 'Escape'"), 'LocalProfileModal must handle Escape key dismissal')
  assert.ok(modalSrc.includes("e.key === 'Tab'"), 'LocalProfileModal must contain Tab focus trap')
  assert.ok(modalSrc.includes("document.body.style.overflow = 'hidden'"), 'LocalProfileModal must lock body scroll while mounted')
  assert.ok(!modalSrc.includes('slate-'), 'LocalProfileModal must not use hardcoded slate utility classes')
})

test('BACKUP_MODAL_SIZING: medium dialog with scroll containment, focus trap, and escape handling', () => {
  const backupSrc = fs.readFileSync(path.join(projectRoot, 'src/components/BackupModal.tsx'), 'utf8')

  assert.ok(backupSrc.includes('max-w-2xl'), 'BackupModal must have structured max-w-2xl proportion')
  assert.ok(backupSrc.includes('max-h-[90dvh]'), 'BackupModal must use dynamic viewport limit (max-h-[90dvh])')
  assert.ok(backupSrc.includes('overscroll-contain'), 'BackupModal must declare overscroll-contain')
  assert.ok(backupSrc.includes("e.key === 'Escape'"), 'BackupModal must handle Escape key dismissal')
  assert.ok(backupSrc.includes("e.key === 'Tab'"), 'BackupModal must contain Tab focus trap')
  assert.ok(backupSrc.includes("document.body.style.overflow = 'hidden'"), 'BackupModal must lock body scroll while mounted')
  assert.ok(!backupSrc.includes('slate-'), 'BackupModal must not use hardcoded slate utility classes')
})

test('BROWSE_SONG_SOURCES_SIZING: wide content dialog with scroll containment and body lock', () => {
  const sourcesSrc = fs.readFileSync(path.join(projectRoot, 'src/components/BrowseSongSourcesModal.tsx'), 'utf8')

  assert.ok(sourcesSrc.includes('max-w-4xl'), 'BrowseSongSourcesModal must be wide (max-w-4xl) for rich multi-column & preview content')
  assert.ok(sourcesSrc.includes('max-h-[90dvh]'), 'BrowseSongSourcesModal must use dynamic viewport limit (max-h-[90dvh])')
  assert.ok(sourcesSrc.includes('overscroll-contain'), 'BrowseSongSourcesModal must declare overscroll-contain')
  assert.ok(sourcesSrc.includes("document.body.style.overflow = 'hidden'"), 'BrowseSongSourcesModal must lock body scroll while open')
  assert.ok(!sourcesSrc.includes('slate-'), 'BrowseSongSourcesModal must not use hardcoded slate utility classes')
})

test('DEBUG_LOGS_MODAL_CONTAINMENT: native dialog with scroll containment and body lock', () => {
  const debugSrc = fs.readFileSync(path.join(projectRoot, 'src/diagnostics/DiagnosticsPanel.tsx'), 'utf8')

  assert.ok(debugSrc.includes('max-w-4xl'), 'DiagnosticsPanel must use max-w-4xl for readable log presentation')
  assert.ok(debugSrc.includes('max-h-[90dvh]'), 'DiagnosticsPanel must use max-h-[90dvh]')
  assert.ok(debugSrc.includes('overscroll-contain'), 'DiagnosticsPanel must contain scroll chaining')
  assert.ok(debugSrc.includes("document.body.style.overflow = 'hidden'"), 'DiagnosticsPanel must lock body scroll when open')
})

test('HEADER_VERTICAL_ALIGNMENT_AND_SPACING: uniform button heights, compact inputs, and clean encoding', () => {
  const headerSrc = fs.readFileSync(path.join(projectRoot, 'src/components/Header.tsx'), 'utf8')

  assert.ok(headerSrc.includes('min-h-[36px]'), 'Header action buttons must use uniform min-h-[36px] for vertical alignment')
  assert.ok(headerSrc.includes('w-9 h-9'), 'Header avatar button must match 36px square sizing')
  assert.ok(!headerSrc.includes('â€¢'), 'Header must not contain corrupted UTF-8 bullet characters')
  assert.ok(headerSrc.includes('GTAR1 Standalone Core • Zero Cloud Sync'), 'Header must contain clean bullet separator')
  assert.ok(!headerSrc.includes('slate-'), 'Header must preserve semantic tokens without hardcoded slate classes')
})
