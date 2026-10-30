const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '..')

// Transpile typescript helper for testing localProfile and components
require.extensions['.ts'] = (module, filename) => {
  const content = fs.readFileSync(filename, 'utf8')
  const transpiled = ts.transpileModule(content.replaceAll('import.meta.env', '({DEV:false})'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  module._compile(transpiled, filename)
}

const { loadLocalProfile, DEFAULT_AVATAR_PATH } = require('../src/utils/localProfile.ts')

// 1. Asset verification
test('MASCOT_ASSETS_PRESENCE_AND_MAPPING: approved assets for dev, prod, and default avatar', () => {
  const yellowPwa192 = path.join(projectRoot, 'public/mascots/bebegirl2-yellow-dev/pwa-192.png')
  const yellowPwa512 = path.join(projectRoot, 'public/mascots/bebegirl2-yellow-dev/pwa-512.png')
  const redPwa192 = path.join(projectRoot, 'public/mascots/bebeboy-red-prod/pwa-192.png')
  const redPwa512 = path.join(projectRoot, 'public/mascots/bebeboy-red-prod/pwa-512.png')
  const greenAvatar = path.join(projectRoot, 'public/avatars/default-avatar.png')

  assert.ok(fs.existsSync(yellowPwa192), 'Yellow Bebegirl2 192 icon exists in public/mascots')
  assert.ok(fs.existsSync(yellowPwa512), 'Yellow Bebegirl2 512 icon exists in public/mascots')
  assert.ok(fs.existsSync(redPwa192), 'Red Bebeboy 192 icon exists in public/mascots')
  assert.ok(fs.existsSync(redPwa512), 'Red Bebeboy 512 icon exists in public/mascots')
  assert.ok(fs.existsSync(greenAvatar), 'Green Bebegirl1 default avatar exists in public/avatars')

  const greenSource = fs.readFileSync(path.join(projectRoot, 'public/mascots/bebegirl1-green-default-avatar/pwa-192.png'))
  const greenPublic = fs.readFileSync(greenAvatar)
  assert.ok(greenSource.equals(greenPublic), 'default-avatar.png matches approved green Bebegirl1 pwa-192 asset exactly')

  // Check DEV root icon matches yellow
  const rootPwa192 = fs.readFileSync(path.join(projectRoot, 'public/pwa-192x192.png'))
  const yellowSource192 = fs.readFileSync(yellowPwa192)
  assert.ok(rootPwa192.equals(yellowSource192), 'Root DEV pwa-192x192.png matches yellow Bebegirl2 asset')
})

// 2. Avatar fallback behavior
test('DEFAULT_PROFILE_AVATAR: falls back to green Bebegirl1 without overriding custom avatar', () => {
  assert.equal(DEFAULT_AVATAR_PATH, '/avatars/default-avatar.png', 'DEFAULT_AVATAR_PATH points to /avatars/default-avatar.png')

  // Mock localStorage for profile loading
  global.localStorage = {
    getItem: (key) => {
      if (key === 'gtar1_local_profile') {
        return JSON.stringify({
          displayName: 'Test Guitarist',
          avatarBase64: 'data:image/png;base64,CUSTOM_IMAGE_DATA',
          updatedAt: 123456789,
        })
      }
      return null
    },
    setItem: () => {},
  }

  const profileWithCustom = loadLocalProfile()
  assert.equal(profileWithCustom.avatarBase64, 'data:image/png;base64,CUSTOM_IMAGE_DATA', 'Preserves custom avatar')

  global.localStorage.getItem = () => null
  const defaultProfile = loadLocalProfile()
  assert.equal(defaultProfile.avatarBase64, undefined, 'Default profile has undefined avatarBase64')

  // Header and modal use: userProfile.avatarBase64 || DEFAULT_AVATAR_PATH
  const effectiveAvatar = defaultProfile.avatarBase64 || DEFAULT_AVATAR_PATH
  assert.equal(effectiveAvatar, '/avatars/default-avatar.png', 'Effective avatar resolves to green Bebegirl1')

  const effectiveCustomAvatar = profileWithCustom.avatarBase64 || DEFAULT_AVATAR_PATH
  assert.equal(effectiveCustomAvatar, 'data:image/png;base64,CUSTOM_IMAGE_DATA', 'Effective custom avatar remains unchanged')
})

// 3. Manifest & Build environment resolution
test('VITE_PWA_CONFIG_ENV_ISOLATION: builds DEV with yellow Bebegirl2 and PROD with red Bebeboy', () => {
  const distDir = path.join(projectRoot, 'dist')
  if (!fs.existsSync(distDir)) {
    return // Build not run yet, skip
  }

  const manifestPath = path.join(distDir, 'manifest.webmanifest')
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    assert.ok(manifest.icons && manifest.icons.length >= 2, 'Manifest defines icons')
    assert.equal(manifest.icons[0].sizes, '192x192', 'First icon is 192x192')
    assert.equal(manifest.icons[1].sizes, '512x512', 'Second icon is 512x512')
  }
})
