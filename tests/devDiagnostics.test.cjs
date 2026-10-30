const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename)
const { createDiagnosticSession, browserProfile, MAX_EXPORT_BYTES } = require('../src/diagnostics/core.ts')

test('20 total entries: oldest eviction, immutable snapshots, clear and fresh session/reload', () => {
  const session = createDiagnosticSession('0.1.0-dev')
  let notifications = 0
  const unsubscribe = session.subscribe(() => notifications++)
  session.record('INITIAL_LOAD_FAILED')
  for (let i = 0; i < 19; i++) session.record('BROWSER_OFFLINE')
  assert.equal(session.getSnapshot().length, 20)
  assert.equal(session.getSnapshot()[0].code, 'INITIAL_LOAD_FAILED')
  const snapshot = session.getSnapshot()
  session.record('BROWSER_ONLINE')
  assert.equal(session.getSnapshot().length, 20)
  assert.equal(session.getSnapshot()[0].code, 'BROWSER_OFFLINE')
  assert.equal(session.getSnapshot().at(-1).code, 'BROWSER_ONLINE')
  assert.throws(() => snapshot.push('secret'))
  assert.equal(Object.isFrozen(snapshot[0]), true)
  session.clear()
  assert.deepEqual(session.getSnapshot(), [])
  assert.match(session.exportLog('').text, /Entries: 0\/20/)
  assert.equal(notifications, 22)
  unsubscribe()
  session.record('SESSION_STARTED')
  assert.equal(notifications, 22)
  assert.deepEqual(createDiagnosticSession('0.1.0-dev').getSnapshot(), [])
})

test('fail closed on sensitive content, hostile objects, prototype keys, controls and oversized input', () => {
  const secret = 'PRIVATE_SONG [Am] lyrics profile=PRIVATE_NAME token=SECRET https://host/path?q=secret'
  const session = createDiagnosticSession(secret)
  const hostile = new Proxy({}, { get() { throw new Error('must never read') } })
  for (const unsafe of [secret, new Error(secret), hostile, { code: 'SESSION_STARTED', message: secret },
    '__proto__', 'constructor', 'toString', 'SESSION_STARTED\n' + secret, '\u001b[31m' + secret, 'x'.repeat(100000), null]) {
    session.record(unsafe)
  }
  assert.equal(session.getSnapshot().length, 0)
  // Extra arguments cannot enter the log, even when the event itself is valid.
  session.record('INITIAL_LOAD_FAILED', secret, hostile)
  for (let i = 0; i < 40; i++) session.record('METRONOME_START_FAILED')
  const log = session.exportLog(secret)
  assert.doesNotMatch(log.text + log.filename, /PRIVATE_|SECRET|https:|\[Am\]|\u001b/)
  assert.match(log.text, /App version: unknown/)
  assert.equal(Buffer.byteLength(log.text) <= MAX_EXPORT_BYTES, true)
  for (const entry of session.getSnapshot()) {
    assert.ok(entry.message.length <= 120)
    assert.match(entry.timestamp, /^\d{4}-\d\d-\d\dT.*Z$/)
    assert.equal(entry.severity, 'error')
    assert.equal(entry.area, 'audio')
    assert.deepEqual(Object.keys(entry), ['timestamp', 'severity', 'area', 'code', 'message'])
  }
})

test('coarse Firefox, Edge, iPhone Safari, Android Firefox and unknown profile fixtures', () => {
  const cases = [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/144.0', 'Windows', 'Firefox', 'Desktop'],
    ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0', 'Windows', 'Edge', 'Desktop'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 'iPhone', 'Safari', 'Mobile'],
    ['Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0', 'Android', 'Firefox', 'Mobile'],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1', 'iPad', 'Safari', 'Tablet'],
    ['unrecognized', 'unknown', 'unknown', 'unknown'],
    [null, 'unknown', 'unknown', 'unknown'],
    ['x'.repeat(4097), 'unknown', 'unknown', 'unknown'],
  ]
  for (const [ua, platform, browser, device] of cases) assert.deepEqual(browserProfile(ua), { platform, browser, device })
})

test('human-readable bounded export, UTC filenames unique with frozen clock, crypto and fallback', () => {
  const RealDate = global.Date
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const random = Math.random
  global.Date = class extends RealDate { constructor() { super('2026-10-30T11:30:00.000Z') } }
  try {
    for (const crypto of [{ getRandomValues(bytes) { bytes.fill(7); return bytes } }, undefined]) {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: crypto })
      Math.random = () => 0.5
      const session = createDiagnosticSession('0.1.0-dev')
      session.record('SESSION_STARTED')
      const logs = Array.from({ length: 100 }, () => session.exportLog(''))
      assert.equal(new Set(logs.map(log => log.filename)).size, 100)
      assert.match(logs[0].filename, /^GTAR1_DEV_unknown_unknown_unknown_20261030T113000Z_[a-f0-9]{32}-[a-z0-9]+\.log$/)
      assert.match(logs[0].text, /schema: 1/)
      assert.match(logs[0].text, /Capture started \(UTC\): 2026-10-30T11:30:00.000Z/)
      assert.match(logs[0].text, /not verified device identity/)
      assert.match(logs[0].text, /info \| app \| SESSION_STARTED/)
    }
  } finally {
    global.Date = RealDate
    Math.random = random
    Object.defineProperty(globalThis, 'crypto', cryptoDescriptor)
  }
})

test('compiled runtime fails closed when DEV gate is false or missing', () => {
  const filename = path.resolve(__dirname, '../src/diagnostics/runtime.ts')
  for (const env of [{ GTAR1_DEV_DIAGNOSTICS: false }, {}]) {
    const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env', JSON.stringify(env))
    const module = new Module(filename)
    module.filename = filename
    module.paths = Module._nodeModulePaths(path.dirname(filename))
    module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename)
    assert.equal(module.exports.diagnostics, null)
    module.exports.recordDiagnostic('SESSION_STARTED')
  }
})

test('existing environment resolution: DEV enabled, PROD and unknown disabled, conflicts fail closed', async () => {
  const { resolveConfig } = await import('vite')
  const original = { GTAR_ENV: process.env.GTAR_ENV, VITE_APP_ENV: process.env.VITE_APP_ENV }
  try {
    for (const [gtar, vite, mode, enabled] of [
      [undefined, undefined, 'development', true],
      ['development', undefined, 'production', true],
      ['production', undefined, 'development', false],
      [undefined, 'production', 'development', false],
      [undefined, undefined, 'production-pwa', false],
      ['development', 'production', 'development', false],
      ['development', undefined, 'production-pwa', false],
      ['stage', undefined, 'development', false],
    ]) {
      for (const [key, value] of Object.entries({ GTAR_ENV: gtar, VITE_APP_ENV: vite })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value
      }
      const config = await resolveConfig({ root: path.resolve(__dirname, '..'), logLevel: 'silent' }, 'build', mode)
      assert.equal(config.define['import.meta.env.GTAR1_DEV_DIAGNOSTICS'], String(enabled), `${gtar}/${vite}/${mode}`)
    }
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
})
