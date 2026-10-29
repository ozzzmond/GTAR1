const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const gtar1Dir = path.resolve(__dirname, '..')
const srcDir = path.join(gtar1Dir, 'src')

function getAllSourceFiles(dir) {
  let results = []
  const list = fs.readdirSync(dir, { withFileTypes: true })
  for (const dirent of list) {
    const fullPath = path.join(dir, dirent.name)
    if (dirent.isDirectory()) {
      if (dirent.name !== 'node_modules' && dirent.name !== 'dist' && dirent.name !== '.git') {
        results = results.concat(getAllSourceFiles(fullPath))
      }
    } else if (/\.(ts|tsx|js|jsx|html)$/.test(dirent.name)) {
      results.push(fullPath)
    }
  }
  return results
}

const allSourceFiles = getAllSourceFiles(srcDir).concat([
  path.join(gtar1Dir, 'index.html'),
  path.join(gtar1Dir, 'package.json'),
])

test('NO_GOOGLE_SDK_OR_AUTHGATE: zero Google OAuth, Client ID, or AuthGate references', () => {
  const forbiddenPatterns = [
    /accounts\.google\.com/i,
    /gsi\/client/i,
    /GOOGLE_CLIENT_ID/i,
    /@react-oauth\/google/i,
    /\bAuthGate\b/,
    /\bgoogle\.accounts\.id\b/,
  ]

  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf8')
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(
        content,
        pattern,
        `File ${path.relative(gtar1Dir, file)} must not contain pattern ${pattern}`
      )
    }
  }
})

test('NO_PERSONAL_CLOUD_SYNC: zero personal sync engines in runtime dependency graph', () => {
  const forbiddenPatterns = [
    /cloudSongbookSync/i,
    /recordsSync/i,
    /bandSync/i,
    /useRecordsAutoSync/i,
    /CloudSyncModal/i,
    /syncJournal/i,
    /gtar-db-prod/i,
  ]

  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf8')
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(
        content,
        pattern,
        `File ${path.relative(gtar1Dir, file)} must not contain pattern ${pattern}`
      )
    }
  }
})

test('NO_LEGACY_STORAGE_MUTATIONS: zero access to legacy DB names or localStorage keys', () => {
  const forbiddenStorageKeys = [
    /'gtar_db'/,
    /"gtar_db"/,
    /'gtar-local-library'/,
    /"gtar-local-library"/,
    /'gtar_library_index_v2'/,
    /"gtar_library_index_v2"/,
    /'gtar_songbook_v1'/,
    /"gtar_songbook_v1"/,
  ]

  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf8')
    for (const pattern of forbiddenStorageKeys) {
      assert.doesNotMatch(
        content,
        pattern,
        `File ${path.relative(gtar1Dir, file)} must not access legacy storage key ${pattern}`
      )
    }
  }
})

test('SEMVER_VERSIONING: version has no v prefix and matches semver', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(gtar1Dir, 'package.json'), 'utf8'))
  assert.ok(pkg.version, 'package.json must declare version')
  assert.ok(!pkg.version.startsWith('v'), 'Version must not start with "v" prefix')
  assert.match(
    pkg.version,
    /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/,
    'Version must be valid SemVer'
  )
})
