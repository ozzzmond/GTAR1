const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file)
const { resolveNavigation } = require('../src/utils/navigation.ts')
const songs = [{ id: 'one', rawContent: 'private', transposeOffset: 2 }, { id: 'two' }]
const setlists = [{ id: 'gig', songs: [{ id: 'missing', entryId: 'gone' }, { id: 'one', entryId: 'a', transposeOffset: 3 }, { id: 'one', entryId: 'b', transposeOffset: 5 }] }]
test('navigation rejects malformed, stale, deleted and unsupported session identities without changing data', () => {
  const before = JSON.stringify({ songs, setlists })
  for (const value of [null, 'bad', {}, {version: 2, tab:'VIEWER'}, {version:1,tab:'UNKNOWN'}, {version:1,tab:'VIEWER',songId:'gone'}, {version:1,tab:'EDITOR',songId:'gone'}, {version:1,tab:'SONGS',setlistId:'gone'}, {version:1,tab:'SONGS',nav:{type:'FOLDER',folderId:'gone'}}, {version:1,tab:'STAGE',stage:{songId:'one',index:-1,returnTab:'SONGS'}}, {version:1,tab:'STAGE',stage:{songId:'gone',index:0,returnTab:'SONGS'}}]) {
    assert.equal(resolveNavigation(value, songs, setlists, []).state.tab, 'SONGS')
  }
  assert.equal(JSON.stringify({songs,setlists}), before)
})
test('navigation reconstructs duplicate occurrences against hydrated canonical library and skips deleted queue entries', () => {
  const result = resolveNavigation({version:1,tab:'STAGE',setlistId:'gig',stage:{songId:'one',entryId:'b',index:2,returnTab:'SETLISTS'}},songs,setlists,[])
  assert.equal(result.state.stage.index,1)
  assert.equal(result.queue.length,2)
  assert.equal(result.queue[1].transposeOffset,5)
  assert.equal(result.queue[1].song,songs[0])
  assert.equal(result.state.stage.returnTab,'SETLISTS')
  assert.ok(!JSON.stringify(result.state).includes('private'))
})
test('navigation restores Reader/Editor identity, whitelists metadata and validates offsets', () => {
  for (const tab of ['VIEWER','EDITOR']) {
    const result = resolveNavigation({version:1,tab,songId:'one',transposeOffset:3,rawContent:'secret'},songs,setlists,[])
    assert.equal(result.song,songs[0])
    assert.equal(result.state.transposeOffset,3)
    assert.ok(!JSON.stringify(result.state).includes('secret'))
  }
  assert.equal(resolveNavigation({version:1,tab:'VIEWER',songId:'one',transposeOffset:Infinity},songs,setlists,[]).state.transposeOffset,undefined)
})
