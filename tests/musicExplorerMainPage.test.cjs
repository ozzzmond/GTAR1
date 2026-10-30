const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

// Test 1: Explorer Selection & Scope filtering logic
test('EXPLORER_NAVIGATION_AND_SCOPE_FILTERING', () => {
  const songs = [
    { id: 's1', title: 'Desert Highway Song', artist: 'Desert Echoes', key: 'Bm', bpm: '75', tags: ['rock', 'acoustic'] },
    { id: 's2', title: 'Acoustic Horizon', artist: 'Meadow Sound', key: 'Em', tags: ['acoustic', '90s'] },
    { id: 's3', title: 'Autumn Leaves', artist: 'Miles Davis', key: 'Gm', bpm: '120', tags: ['jazz'] },
    { id: 's4', title: 'Mountain Songbird', artist: 'Pine Ridge Band', key: 'G', tags: ['acoustic'] },
  ]

  // Filter by tag 'acoustic'
  const acousticSongs = songs.filter(s => s.tags?.includes('acoustic'))
  assert.equal(acousticSongs.length, 3)

  // Filter by tag 'jazz'
  const jazzSongs = songs.filter(s => s.tags?.includes('jazz'))
  assert.equal(jazzSongs.length, 1)
  assert.equal(jazzSongs[0].title, 'Autumn Leaves')

  // Search filtering within acoustic scope
  const q = 'meadow'
  const searchedInAcoustic = acousticSongs.filter(s =>
    s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
  )
  assert.equal(searchedInAcoustic.length, 1)
  assert.equal(searchedInAcoustic[0].id, 's2')
})

// Test 2: Setlists, Folders, and Song Membership Search
test('SETLIST_MEMBERSHIP_AND_SEARCH', () => {
  const setlists = [
    {
      id: 'sl1',
      name: 'Sunday Worship',
      folderId: 'f1',
      songs: [
        { id: 's1', title: 'Amazing Grace', artist: 'Hymn', position: 0 },
        { id: 's2', title: 'Beacon of Light', artist: 'Valley Voices', position: 1 },
      ],
    },
    {
      id: 'sl2',
      name: 'Friday Acoustic Gig',
      folderId: null,
      songs: [
        { id: 's3', title: 'Acoustic Horizon', artist: 'Meadow Sound', position: 0 },
      ],
    },
  ]

  // Search setlist by matching track inside setlist
  const q = 'valley'
  const matchingSetlists = setlists.filter(sl =>
    sl.name.toLowerCase().includes(q) ||
    sl.songs.some(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
  )
  assert.equal(matchingSetlists.length, 1)
  assert.equal(matchingSetlists[0].id, 'sl1')
})

// Test 3: Local Profile Initials and Validation
test('LOCAL_PROFILE_INTEGRITY_AND_INITIALS', () => {
  function getInitials(name) {
    if (!name || !name.trim()) return 'GT'
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  assert.equal(getInitials('John Mayer'), 'JM')
  assert.equal(getInitials('Slash'), 'SL')
  assert.equal(getInitials(''), 'GT')
  assert.equal(getInitials('  Eddie Van Halen  '), 'EH')

  // Image validation rules: max 2MB and allowed types
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  const MAX_BYTES = 2 * 1024 * 1024

  function validateAvatar(mimeType, sizeBytes) {
    if (!ALLOWED_TYPES.includes(mimeType)) return { valid: false, error: 'type' }
    if (sizeBytes > MAX_BYTES) return { valid: false, error: 'size' }
    return { valid: true }
  }

  assert.equal(validateAvatar('image/png', 500000).valid, true)
  assert.equal(validateAvatar('image/svg+xml', 1000).valid, false)
  assert.equal(validateAvatar('image/jpeg', 3 * 1024 * 1024).valid, false)
})

// Test 4: Verify Zero Auth, Google SDK, or Network coupling in components
test('NO_NETWORK_OR_AUTH_GATE_IN_BATCH2_COMPONENTS', () => {
  const compDir = path.resolve(__dirname, '../src/components')
  const files = fs.readdirSync(compDir)
  for (const f of files) {
    const fullPath = path.join(compDir, f)
    const stat = fs.statSync(fullPath)
    if (stat.isFile() && (f.endsWith('.tsx') || f.endsWith('.ts'))) {
      const content = fs.readFileSync(fullPath, 'utf8')
      assert.doesNotMatch(content, /google\.accounts/i, `Forbidden Google Accounts in ${f}`)
      assert.doesNotMatch(content, /accounts\.google\.com/i, `Forbidden accounts.google.com in ${f}`)
      assert.doesNotMatch(content, /AuthGate/i, `Forbidden AuthGate in ${f}`)
      assert.doesNotMatch(content, /CloudSync/i, `Forbidden CloudSync in ${f}`)
      assert.doesNotMatch(content, /useRecordsAutoSync/i, `Forbidden useRecordsAutoSync in ${f}`)
    }
  }
})

// Test 5: Verify Responsive Mobile Drawer and Keyboard Escape Handling
test('ACCESSIBILITY_AND_ESCAPE_HANDLING_INVARIANTS', () => {
  const headerPath = path.resolve(__dirname, '../src/components/Header.tsx')
  const headerContent = fs.readFileSync(headerPath, 'utf8')
  
  // Escape to close or clear
  assert.match(headerContent, /e\.key === 'Escape'/, 'Header must handle Escape key for search input')
  // Mobile drawer toggle present
  assert.match(headerContent, /onToggleMobileDrawer/, 'Header must provide mobile drawer toggle')
  // ARIA labels present for accessibility
  assert.match(headerContent, /aria-label/, 'Header must include accessible aria-labels')
})
