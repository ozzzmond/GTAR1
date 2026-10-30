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

    const isDevBuild = manifest.name.includes('(Dev)')
    const expectedSubdir = isDevBuild ? 'bebegirl2-yellow-dev' : 'bebeboy-red-prod'

    for (const file of ['favicon-16x16.png', 'favicon-32x32.png', 'favicon-48x48.png', 'favicon.ico']) {
      const distFile = path.join(distDir, file)
      assert.ok(fs.existsSync(distFile), `dist/${file} exists in build output`)
      const expectedFile = path.join(projectRoot, 'public/mascots', expectedSubdir, file)
      assert.ok(fs.readFileSync(distFile).equals(fs.readFileSync(expectedFile)), `dist/${file} matches ${expectedSubdir}`)
    }
  }
})

// 4. Header mascot logo rendering
test('HEADER_MASCOT_LOGO_RENDERING: renders mascot icon and eliminates legacy blue G', () => {
  const headerPath = path.join(projectRoot, 'src/components/Header.tsx')
  const headerContent = fs.readFileSync(headerPath, 'utf8')

  // Header must use the offline bundled PWA mascot icon
  assert.match(headerContent, /src="\/pwa-192x192\.png"/, 'Header must render /pwa-192x192.png mascot icon')
  assert.match(headerContent, /alt="GTAR application logo"/, 'Header must have accessible alt label')

  // Header must not contain the legacy hardcoded blue G square
  assert.ok(!headerContent.includes('bg-sky-600 flex items-center justify-center font-black text-white text-base shadow-sm group-hover:bg-sky-500'), 'Header must not contain legacy blue G styles')
  assert.ok(!headerContent.match(/<div[^>]*bg-sky-600[^>]*>\s*G\s*<\/div>/), 'Header must not render legacy blue G')
})


// 5. Favicon variants and multi-resolution ICO validation
test('FAVICON_VARIANTS_PRESENCE_AND_ICO_VALIDATION: valid 16/32/48 PNGs and multi-res ICO for DEV and PROD', () => {
  function getPngDimensions(buf) {
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Must be PNG signature')
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }

  function parseIco(buf) {
    assert.equal(buf.readUInt16LE(0), 0, 'ICO reserved must be 0')
    assert.equal(buf.readUInt16LE(2), 1, 'ICO type must be 1 (icon)')
    const count = buf.readUInt16LE(4)
    assert.ok(count >= 3, 'ICO must contain at least 3 entries')
    const entries = []
    for (let i = 0; i < count; i++) {
      const offset = 6 + i * 16
      const width = buf.readUInt8(offset) || 256
      const height = buf.readUInt8(offset + 1) || 256
      const bpp = buf.readUInt16LE(offset + 6)
      const size = buf.readUInt32LE(offset + 8)
      const dataOffset = buf.readUInt32LE(offset + 12)
      entries.push({ width, height, bpp, size, dataOffset })
    }
    return entries
  }

  const environments = [
    { name: 'DEV (Yellow Bebegirl2)', dir: 'public/mascots/bebegirl2-yellow-dev' },
    { name: 'PROD (Red Bebeboy)', dir: 'public/mascots/bebeboy-red-prod' },
  ]

  for (const env of environments) {
    const p16 = path.join(projectRoot, env.dir, 'favicon-16x16.png')
    const p32 = path.join(projectRoot, env.dir, 'favicon-32x32.png')
    const p48 = path.join(projectRoot, env.dir, 'favicon-48x48.png')
    const pIco = path.join(projectRoot, env.dir, 'favicon.ico')

    assert.ok(fs.existsSync(p16), `${env.name} favicon-16x16.png exists`)
    assert.ok(fs.existsSync(p32), `${env.name} favicon-32x32.png exists`)
    assert.ok(fs.existsSync(p48), `${env.name} favicon-48x48.png exists`)
    assert.ok(fs.existsSync(pIco), `${env.name} favicon.ico exists`)

    assert.deepEqual(getPngDimensions(fs.readFileSync(p16)), { width: 16, height: 16 })
    assert.deepEqual(getPngDimensions(fs.readFileSync(p32)), { width: 32, height: 32 })
    assert.deepEqual(getPngDimensions(fs.readFileSync(p48)), { width: 48, height: 48 })

    const icoEntries = parseIco(fs.readFileSync(pIco))
    const sizes = icoEntries.map((e) => `${e.width}x${e.height}`)
    assert.ok(sizes.includes('16x16'), `${env.name} ICO includes 16x16`)
    assert.ok(sizes.includes('32x32'), `${env.name} ICO includes 32x32`)
    assert.ok(sizes.includes('48x48'), `${env.name} ICO includes 48x48`)
  }
})

// 6. index.html browser tab favicon references
test('INDEX_HTML_FAVICON_REFERENCES: accurate browser-tab icon links and no legacy SVG icon override', () => {
  const htmlPath = path.join(projectRoot, 'index.html')
  const html = fs.readFileSync(htmlPath, 'utf8')

  // Must NOT declare type="image/svg+xml" for favicon (which overrides mascot icons in modern browsers)
  assert.ok(!html.includes('type="image/svg+xml"'), 'index.html must not use type="image/svg+xml" favicon link')
  assert.ok(!html.includes('href="/favicon.svg"'), 'index.html must not point browser tab icon to /favicon.svg')

  // Must declare high-resolution and standard PNG favicons plus ICO
  assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="\/favicon-32x32\.png" \/>/, 'index.html includes 32x32 favicon')
  assert.match(html, /<link rel="icon" type="image\/png" sizes="16x16" href="\/favicon-16x16\.png" \/>/, 'index.html includes 16x16 favicon')
  assert.match(html, /<link rel="icon" href="\/favicon\.ico"/, 'index.html includes /favicon.ico fallback')
})

// Validate the generated artifact, including revisions for the bytes Workbox will fetch.
test('ISSUE_52_PRECACHE_GUARD: unique URLs, final-output hashes and all environment icons', () => {
  const vm = require('node:vm')
  const crypto = require('node:crypto')
  const dist = path.join(projectRoot, 'dist')
  const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8')
  const match = sw.match(/precacheAndRoute\(\[([\s\S]*?)\],/)
  assert.ok(match, 'Built service worker contains a precache list; build before tests')
  const entries = vm.runInNewContext('[' + match[1] + ']', {}, { timeout: 1000 })
  assert.equal(new Set(entries.map(entry => entry.url)).size, entries.length, 'Each precache URL has exactly one owner')
  for (const entry of entries) {
    if (entry.revision !== null) {
      const bytes = fs.readFileSync(path.join(dist, entry.url))
      assert.equal(entry.revision, crypto.createHash('md5').update(bytes).digest('hex'), `Final output revision: ${entry.url}`)
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.webmanifest'), 'utf8'))
  const environment = manifest.short_name === 'GTAR' ? 'bebeboy-red-prod' : 'bebegirl2-yellow-dev'
  const icons = {
    'pwa-192x192.png': 'pwa-192.png',
    'pwa-512x512.png': 'pwa-512.png',
    'apple-touch-icon.png': 'apple-touch-icon-180.png',
    'favicon-16x16.png': 'favicon-16x16.png',
    'favicon-32x32.png': 'favicon-32x32.png',
    'favicon-48x48.png': 'favicon-48x48.png',
    'favicon.png': 'favicon-32x32.png',
    'favicon.ico': 'favicon.ico',
  }
  for (const [target, source] of Object.entries(icons)) {
    assert.equal(fs.existsSync(path.join(projectRoot, 'public', target)), false, `${target} must not have a second public owner`)
    assert.ok(entries.some(entry => entry.url === target), `${target} is precached`)
    assert.ok(fs.readFileSync(path.join(dist, target)).equals(fs.readFileSync(path.join(projectRoot, 'public/mascots', environment, source))), `${target} matches ${environment}`)
  }
  for (const icon of manifest.icons) assert.ok(Object.hasOwn(icons, icon.src), 'Manifest uses generated icons')
})
