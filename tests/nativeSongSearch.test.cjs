const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename)
const { nativeSongSearch, findLocalSearchResults } = require('../src/utils/nativeSongSearch.ts')
const { parseImportedChordContent, MAX_IMPORT_BYTES } = require('../src/utils/songSourceRetrieval.ts')

test('local search is immediate, cross-scope, bounded, and independent of disabled transport', async () => {
  const originalFetch = global.fetch
  global.fetch = () => { throw new Error('Unexpected network request') }
  try {
    const songs = Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: 'Grace', artist: 'Local Artist', tags: ['Worship'] }))
    assert.equal(findLocalSearchResults('  GRACE artist ', songs, []).total, 20)
    assert.equal(findLocalSearchResults('worship', songs, []).songs.length, 8)
    assert.equal(findLocalSearchResults('Gig', songs, [{ name: 'Grace Gig' }]).setlists.length, 1)
    assert.equal(findLocalSearchResults(' ', songs, []).total, 0)
    assert.equal(nativeSongSearch.available, false)
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(nativeSongSearch.search('Grace', controller.signal), /disabled/)
    await assert.rejects(nativeSongSearch.preview({}, controller.signal), /disabled/)
  } finally { global.fetch = originalFetch }
})

test('DEV.17 pasted markup converts to ChordPro without invented musical metadata', () => {
  const parsed = parseImportedChordContent('{title: Owned chart}\n[tab][ch]C#m7[/ch]Hello [ch]G/B[/ch]world[/tab]')
  assert.equal(parsed.success, true)
  assert.equal(parsed.song.format, 'CHORD_PRO')
  assert.match(parsed.song.rawContent, /\[C#m7\]Hello \[G\/B\]world/)
  assert.equal(parsed.song.key, '')
  assert.equal(parsed.song.bpm, undefined)
  assert.doesNotMatch(parsed.song.rawContent, /\[\/?(?:tab|ch)\]/)
})

test('import rejects UTF-8 overflow, empty controls and malformed HTML; metadata cannot inject directives', () => {
  assert.equal(parseImportedChordContent('é'.repeat(MAX_IMPORT_BYTES / 2 + 1)).success, false)
  assert.equal(parseImportedChordContent('\x00\x01').success, false)
  for (const content of ['<html>blocked', '<script src=x', '<IMG src=x onerror=alert(1)>', '<!DOCTYPE html>']) {
    assert.equal(parseImportedChordContent(content).success, false, content)
  }
  const parsed = parseImportedChordContent('{comment: Chart}', { defaultTitle: 'Test\n{key: C}' })
  assert.equal(parsed.success, true)
  assert.doesNotMatch(parsed.song.title, /[\n{}]/)
  assert.equal(parsed.song.key, '')
})

test('DEV boundary is excluded from explicit PROD targets', async () => {
  const { resolveConfig } = await import('vite')
  const config = await resolveConfig({ mode: 'production-pwa', logLevel: 'silent' }, 'build')
  assert.equal(config.define['import.meta.env.GTAR1_DEV_NATIVE_SEARCH'], 'false')
})
