import { normalizeFontSettings, applyFontSettings, validateFontSettings, type FontSettings } from './customFonts'
export const SETTINGS_KEYS = {
  appearance: 'gtar_appearance_state',
  themeMode: 'gtar_theme_store',
  factoryThemeOverrides: 'gtar_factory_theme_overrides',
  customThemeColors: 'gtar_custom_theme_colors',
  fontStyle: 'gtar_font_style_store',
  isTwoColumn: 'gtar_twocolumn_store',
  fontSizePx: 'gtar_stage_font_size',
  scrollSpeed: 'gtar_stage_scroll_speed',
} as const

export const APPEARANCE_STATE_VERSION = 1 as const

export const SETTINGS_CHANGED = 'gtar-settings-restored'
export const STANDALONE_PALETTE_KEY = 'gtar_standalone_custom_theme_colors'
export const CLOUD_THEME_SETTINGS_VERSION = 1 as const
export const MAX_CLOUD_THEME_SETTINGS_BYTES = 64 * 1024
export const THEME_MODES = [
  'solarized-dark',
  'amber-stage',
  'oled-black',
  'paper-light',
  'crimson-stage',
  'azure-stage',
  'e-ink-paper',
  'custom',
] as const
export const FONT_STYLES = ['mono', 'sans', 'serif'] as const
export type ThemeMode = typeof THEME_MODES[number]
export type SongFontStyleOption = typeof FONT_STYLES[number]
export interface CustomThemeIdentity { factoryId: Exclude<ThemeMode, 'custom'>; displayName: string }
export const CUSTOM_THEME_NAME_MAX_LENGTH = 80
export function validateCustomThemeIdentity(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Theme identity must be an object']
  const identity = value as Record<string, unknown>
  if (Object.keys(identity).some(key => !['factoryId', 'displayName'].includes(key))) return ['Unsupported theme identity field']
  if (identity.factoryId === 'custom' || !THEME_MODES.includes(identity.factoryId as ThemeMode)) return ['Unsupported factory theme']
  if (typeof identity.displayName !== 'string' || !identity.displayName.trim() || identity.displayName.trim().length > CUSTOM_THEME_NAME_MAX_LENGTH) return ['Custom name must contain 1–80 characters']
  return []
}
export type FactoryThemeOverrides = Partial<Record<Exclude<ThemeMode, 'custom'>, CustomThemeColors>>
export interface CustomThemeColors {
  identity?: CustomThemeIdentity
  actionColor?: string
  selectionColor?: string
  sectionIconColor?: string
  fonts?: FontSettings
  uiPrimaryText?: string
  uiSecondaryText?: string
  uiSectionText?: string
  uiMutedText?: string
  uiLinkText?: string
  // STAGE
  bgHex: string
  textHex: string
  chordHex: string
  sectionHex: string

  // APP_CHROME
  headerBg?: string
  headerPrimaryText?: string
  headerSecondaryText?: string
  headerIconColor?: string
  toolbarBg?: string
  searchBg?: string
  searchBorder?: string
  filterBarBg?: string
  iconColor?: string

  // CARDS_AND_BOXES
  setlistCardBg?: string
  songCardBg?: string
  cardBorder?: string
  selectedCardBg?: string
  selectedCardBorder?: string

  // CONTROLS
  buttonBg?: string
  buttonText?: string
  inputBg?: string
  inputText?: string
  inputBorder?: string
  accentColor?: string

  // STAGE_FLOATING_CONTROLS
  dockBg?: string
  dockBorder?: string
  dockBtnBg?: string
  dockBtnIcon?: string
  dockPlayBg?: string
  dockPlayIcon?: string
}
export interface BackupSettings {
  factoryThemeOverrides?: FactoryThemeOverrides
  themeMode?: ThemeMode
  customThemeColors?: CustomThemeColors
  stageSettings?: { fontStyle?: SongFontStyleOption; fontSizePx?: number; isTwoColumn?: boolean; scrollSpeed?: number }
}

export interface CloudThemeSettings {
  version: typeof CLOUD_THEME_SETTINGS_VERSION
  themeMode?: ThemeMode
  customThemeColors?: CustomThemeColors
  factoryThemeOverrides?: FactoryThemeOverrides
}

export interface AppearanceSnapshot {
  version: typeof APPEARANCE_STATE_VERSION
  themeMode: ThemeMode
  customThemeColors: CustomThemeColors
  factoryThemeOverrides: FactoryThemeOverrides
}

export const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
  actionColor: '#2AA198',
  selectionColor: '#2AA198',
  sectionIconColor: '#2AA198',
  uiPrimaryText: '#F1F5F9',
  uiSecondaryText: '#CBD5E1',
  uiSectionText: '#F1F5F9',
  uiMutedText: '#94A3B8',
  uiLinkText: '#38BDF8',
  bgHex: '#121820',
  textHex: '#F1F5F9',
  chordHex: '#F59E0B',
  sectionHex: '#A78BFA',
  headerBg: '#1A222D',
  headerPrimaryText: '#F1F5F9',
  headerSecondaryText: '#CBD5E1',
  headerIconColor: '#94A3B8',
  toolbarBg: '#121820',
  searchBg: '#121820',
  searchBorder: '#2A3644',
  filterBarBg: '#1A222D',
  iconColor: '#94A3B8',
  setlistCardBg: '#1A222D',
  songCardBg: '#1A222D',
  cardBorder: '#2A3644',
  selectedCardBg: '#22313F',
  selectedCardBorder: '#38BDF8',
  buttonBg: '#24303E',
  buttonText: '#F1F5F9',
  inputBg: '#121820',
  inputText: '#F1F5F9',
  inputBorder: '#2A3644',
  accentColor: '#F59E0B',
  dockBg: '#1A222D',
  dockBorder: '#2A3644',
  dockBtnBg: '#121820',
  dockBtnIcon: '#F1F5F9',
  dockPlayBg: '#F59E0B',
  dockPlayIcon: '#000000',
}

function typographyDefaults(colors: Partial<CustomThemeColors>) {
  const light = parseInt((colors.bgHex || '#121820').slice(1, 3), 16) * .299 +
    parseInt((colors.bgHex || '#121820').slice(3, 5), 16) * .587 +
    parseInt((colors.bgHex || '#121820').slice(5, 7), 16) * .114 > 150
  return {
    uiPrimaryText: colors.uiPrimaryText || (light ? '#111827' : '#F1F5F9'),
    uiSecondaryText: colors.uiSecondaryText || (light ? '#374151' : '#CBD5E1'),
    uiSectionText: colors.uiSectionText || (light ? '#111827' : '#F1F5F9'),
    uiMutedText: colors.uiMutedText || (light ? '#4B5563' : '#94A3B8'),
    uiLinkText: colors.uiLinkText || (light ? '#1D4ED8' : '#38BDF8'),
  }
}

function headerDefaults(colors: Partial<CustomThemeColors>) {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(offset => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
    })
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
  }
  const background = luminance(colors.headerBg || DEFAULT_CUSTOM_COLORS.headerBg!)
  const contrast = (hex: string) => {
    const foreground = luminance(hex)
    return (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05)
  }
  const safeColor = (candidate: string | undefined, light: string, dark: string) => {
    if (candidate && contrast(candidate) >= 4.5) return candidate
    if (contrast(light) >= 4.5) return light
    if (contrast(dark) >= 4.5) return dark
    return contrast('#FFFFFF') >= contrast('#000000') ? '#FFFFFF' : '#000000'
  }
  return {
    headerPrimaryText: colors.headerPrimaryText || safeColor(colors.uiPrimaryText, '#F1F5F9', '#111827'),
    headerSecondaryText: colors.headerSecondaryText || safeColor(colors.uiSecondaryText, '#CBD5E1', '#374151'),
    headerIconColor: colors.headerIconColor || safeColor(colors.iconColor, '#94A3B8', '#4B5563'),
  }
}

function surfaceDefaults(colors: Partial<CustomThemeColors>) {
  const bg = colors.bgHex || DEFAULT_CUSTOM_COLORS.bgHex
  const hex = bg.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16) || 0
  const g = parseInt(hex.substring(2, 4), 16) || 0
  const b = parseInt(hex.substring(4, 6), 16) || 0
  const light = (r * 299 + g * 587 + b * 114) / 1000 > 150

  if (!light) {
    return {
      toolbarBg: colors.toolbarBg || DEFAULT_CUSTOM_COLORS.toolbarBg!,
      filterBarBg: colors.filterBarBg || DEFAULT_CUSTOM_COLORS.filterBarBg!,
      searchBg: colors.searchBg || DEFAULT_CUSTOM_COLORS.searchBg!,
      searchBorder: colors.searchBorder || DEFAULT_CUSTOM_COLORS.searchBorder!,
      iconColor: colors.iconColor || DEFAULT_CUSTOM_COLORS.iconColor!,
      setlistCardBg: colors.setlistCardBg || DEFAULT_CUSTOM_COLORS.setlistCardBg!,
      songCardBg: colors.songCardBg || DEFAULT_CUSTOM_COLORS.songCardBg!,
      cardBorder: colors.cardBorder || DEFAULT_CUSTOM_COLORS.cardBorder!,
      selectedCardBg: colors.selectedCardBg || DEFAULT_CUSTOM_COLORS.selectedCardBg!,
      selectedCardBorder: colors.selectedCardBorder || DEFAULT_CUSTOM_COLORS.selectedCardBorder!,
      buttonBg: colors.buttonBg || DEFAULT_CUSTOM_COLORS.buttonBg!,
      buttonText: colors.buttonText || DEFAULT_CUSTOM_COLORS.buttonText!,
      inputBg: colors.inputBg || DEFAULT_CUSTOM_COLORS.inputBg!,
      inputText: colors.inputText || DEFAULT_CUSTOM_COLORS.inputText!,
      inputBorder: colors.inputBorder || DEFAULT_CUSTOM_COLORS.inputBorder!,
      accentColor: colors.accentColor || DEFAULT_CUSTOM_COLORS.accentColor!,
    }
  }

  const cardSurface = colors.songCardBg || colors.setlistCardBg || '#FFFFFF'
  const border = colors.cardBorder || '#' + Math.max(0, r - 35).toString(16).padStart(2, '0') + Math.max(0, g - 35).toString(16).padStart(2, '0') + Math.max(0, b - 35).toString(16).padStart(2, '0')

  return {
    toolbarBg: colors.toolbarBg || bg,
    filterBarBg: colors.filterBarBg || cardSurface,
    searchBg: colors.searchBg || cardSurface,
    searchBorder: colors.searchBorder || border,
    iconColor: colors.iconColor || '#64748B',
    setlistCardBg: colors.setlistCardBg || cardSurface,
    songCardBg: colors.songCardBg || cardSurface,
    cardBorder: border,
    selectedCardBg: colors.selectedCardBg || '#EEF7F6',
    selectedCardBorder: colors.selectedCardBorder || '#2AA198',
    buttonBg: colors.buttonBg || '#' + Math.max(0, r - 15).toString(16).padStart(2, '0') + Math.max(0, g - 15).toString(16).padStart(2, '0') + Math.max(0, b - 15).toString(16).padStart(2, '0'),
    buttonText: colors.buttonText || '#111827',
    inputBg: colors.inputBg || '#FFFFFF',
    inputText: colors.inputText || '#111827',
    inputBorder: colors.inputBorder || border,
    accentColor: colors.accentColor || '#0284C7',
  }
}

export function normalizeCustomThemeColors(
  colors?: Partial<CustomThemeColors> | null
): CustomThemeColors {
  if (!colors) return { ...DEFAULT_CUSTOM_COLORS, fonts: normalizeFontSettings(undefined) }
  return {
    ...DEFAULT_CUSTOM_COLORS,
    ...colors,
    ...typographyDefaults(colors),
    ...headerDefaults(colors),
    ...surfaceDefaults(colors),
    actionColor: colors.actionColor || colors.uiLinkText || '#2AA198',
    selectionColor: colors.selectionColor || colors.selectedCardBorder || '#2AA198',
    sectionIconColor: colors.sectionIconColor || colors.iconColor || '#2AA198',
    ...(colors.identity ? { identity: { factoryId: colors.identity.factoryId, displayName: colors.identity.displayName.trim() } } : {}),
    fonts: normalizeFontSettings(colors.fonts),
    bgHex: colors.bgHex || DEFAULT_CUSTOM_COLORS.bgHex,
    textHex: colors.textHex || DEFAULT_CUSTOM_COLORS.textHex,
    chordHex: colors.chordHex || DEFAULT_CUSTOM_COLORS.chordHex,
    sectionHex: colors.sectionHex || DEFAULT_CUSTOM_COLORS.sectionHex,
  }
}

const CANONICAL_PALETTE_KEY_ORDER: Array<keyof CustomThemeColors> = [
  'identity',
  'actionColor',
  'selectionColor',
  'sectionIconColor',
  'uiPrimaryText',
  'uiSecondaryText',
  'uiSectionText',
  'uiMutedText',
  'uiLinkText',
  'bgHex',
  'textHex',
  'chordHex',
  'sectionHex',
  'headerBg',
  'headerPrimaryText',
  'headerSecondaryText',
  'headerIconColor',
  'toolbarBg',
  'searchBg',
  'searchBorder',
  'filterBarBg',
  'iconColor',
  'setlistCardBg',
  'songCardBg',
  'cardBorder',
  'selectedCardBg',
  'selectedCardBorder',
  'buttonBg',
  'buttonText',
  'inputBg',
  'inputText',
  'inputBorder',
  'accentColor',
  'dockBg',
  'dockBorder',
  'dockBtnBg',
  'dockBtnIcon',
  'dockPlayBg',
  'dockPlayIcon',
  'fonts',
]

function canonicalizeThemePalette(raw: Partial<CustomThemeColors> | undefined, stripIdentity: boolean): CustomThemeColors {
  const normalized = normalizeCustomThemeColors(raw)
  const ordered: Record<string, unknown> = {}
  for (const key of CANONICAL_PALETTE_KEY_ORDER) {
    if (key === 'identity') {
      if (!stripIdentity && normalized.identity) {
        ordered.identity = {
          factoryId: normalized.identity.factoryId,
          displayName: normalized.identity.displayName.trim(),
        }
      }
    } else if (key === 'fonts') {
      ordered.fonts = normalizeFontSettings(normalized.fonts)
    } else if (normalized[key] !== undefined) {
      ordered[key] = normalized[key]
    }
  }
  return ordered as unknown as CustomThemeColors
}

export function validateBackupSettings(data: Record<string, unknown>): string[] {
  const errors: string[] = []
  if ('factoryThemeOverrides' in data) {
    const overrides = data.factoryThemeOverrides
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) errors.push('factoryThemeOverrides: must be an object')
    else for (const [id, palette] of Object.entries(overrides)) {
      const identity = (palette as CustomThemeColors | null)?.identity
      if (id === 'custom' || !THEME_MODES.includes(id as ThemeMode) || identity?.factoryId !== id) errors.push('factoryThemeOverrides: invalid factory slot')
      errors.push(...validateBackupSettings({ customThemeColors: palette }))
    }
  }
  if ('themeMode' in data && !THEME_MODES.includes(data.themeMode as ThemeMode)) errors.push('themeMode: unsupported theme')
  if ('customThemeColors' in data) {
    const colors = data.customThemeColors
    if (!colors || typeof colors !== 'object' || Array.isArray(colors)) errors.push('customThemeColors: must be a color object')
    else {
      const requiredFields = ['bgHex', 'textHex', 'chordHex', 'sectionHex']
      const optionalFields = [
        'headerPrimaryText', 'headerSecondaryText', 'headerIconColor',
        'headerBg', 'toolbarBg', 'searchBg', 'searchBorder', 'filterBarBg', 'iconColor',
        'setlistCardBg', 'songCardBg', 'cardBorder', 'selectedCardBg', 'selectedCardBorder',
        'buttonBg', 'buttonText', 'inputBg', 'inputText', 'inputBorder', 'accentColor',
        'dockBg', 'dockBorder', 'dockBtnBg', 'dockBtnIcon', 'dockPlayBg', 'dockPlayIcon',
        'actionColor', 'selectionColor', 'sectionIconColor',
        'uiPrimaryText', 'uiSecondaryText', 'uiSectionText', 'uiMutedText', 'uiLinkText',
      ]
      const allowedFields = new Set([...requiredFields, ...optionalFields])
      for (const field of requiredFields) {
        const color = (colors as Record<string, unknown>)[field]
        if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) errors.push(`customThemeColors.${field}: expected #RRGGBB`)
      }
      for (const [field, color] of Object.entries(colors)) {
        if (field === 'identity') {
          if (color !== undefined) {
            errors.push(...validateCustomThemeIdentity(color))
          }
        } else if (field === 'fonts') {
          errors.push(...validateFontSettings(color))
        } else if (!allowedFields.has(field)) {
          errors.push(`customThemeColors.${field}: unknown color setting`)
        } else if (optionalFields.includes(field) && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) {
          errors.push(`customThemeColors.${field}: expected #RRGGBB`)
        }
      }
    }
  }
  if ('stageSettings' in data) {
    const settings = data.stageSettings
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) errors.push('stageSettings: must be an object')
    else for (const [key, value] of Object.entries(settings)) {
      if (key === 'fontStyle') {
        if (!FONT_STYLES.includes(value)) errors.push('stageSettings.fontStyle: expected mono, sans or serif')
      } else if (key === 'isTwoColumn') {
        if (typeof value !== 'boolean') errors.push('stageSettings.isTwoColumn: must be a boolean')
      } else if (key === 'fontSizePx' || key === 'scrollSpeed') {
        const [min, max] = key === 'fontSizePx' ? [12, 38] : [5, 180]
        if (!Number.isSafeInteger(value) || value < min || value > max) errors.push(`stageSettings.${key}: must be an integer from ${min} to ${max}`)
      } else errors.push(`stageSettings.${key}: unknown setting`)
    }
  }
  return errors
}

export function validateCloudThemeSettings(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['themeSettings: must be an object']
  }
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    return ['themeSettings: must be JSON serializable']
  }
  if (!serialized || serialized.length > MAX_CLOUD_THEME_SETTINGS_BYTES) {
    return [`themeSettings: exceeds maximum size of ${MAX_CLOUD_THEME_SETTINGS_BYTES} bytes`]
  }
  const obj = value as Record<string, unknown>
  const errors: string[] = []
  const allowedKeys = new Set(['version', 'themeMode', 'customThemeColors', 'factoryThemeOverrides'])
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      errors.push(`themeSettings.${key}: unsupported field`)
    }
  }
  if ('version' in obj && obj.version !== undefined && obj.version !== CLOUD_THEME_SETTINGS_VERSION) {
    errors.push('themeSettings.version: unsupported schema version')
  }
  const backupCandidate: Record<string, unknown> = {}
  if ('themeMode' in obj && obj.themeMode !== undefined) {
    backupCandidate.themeMode = obj.themeMode
  }
  if ('customThemeColors' in obj && obj.customThemeColors !== undefined) {
    backupCandidate.customThemeColors = obj.customThemeColors
  }
  if ('factoryThemeOverrides' in obj && obj.factoryThemeOverrides !== undefined) {
    backupCandidate.factoryThemeOverrides = obj.factoryThemeOverrides
  }
  errors.push(...validateBackupSettings(backupCandidate))
  return errors
}

export function normalizeCloudThemeSettings(raw: CloudThemeSettings | Partial<CloudThemeSettings>): CloudThemeSettings {
  const errors = validateCloudThemeSettings(raw)
  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }
  let mode: ThemeMode = raw.themeMode && THEME_MODES.includes(raw.themeMode) ? raw.themeMode : 'solarized-dark'
  const rawOverrides = raw.factoryThemeOverrides ?? {}
  const overridesMap = new Map<Exclude<ThemeMode, 'custom'>, CustomThemeColors>()
  for (const slotId of THEME_MODES) {
    if (slotId === 'custom') continue
    const palette = rawOverrides[slotId]
    if (palette) {
      overridesMap.set(slotId, canonicalizeThemePalette(palette, false))
    }
  }

  let standaloneSource: Partial<CustomThemeColors> | undefined = raw.customThemeColors
  if (raw.customThemeColors?.identity) {
    const slotId = raw.customThemeColors.identity.factoryId
    if (!overridesMap.has(slotId)) {
      overridesMap.set(slotId, canonicalizeThemePalette(raw.customThemeColors, false))
    }
    if (mode === 'custom') {
      mode = slotId
    }
    standaloneSource = DEFAULT_CUSTOM_COLORS
  }

  const sortedOverrides: FactoryThemeOverrides = {}
  for (const slotId of THEME_MODES) {
    if (slotId === 'custom') continue
    const palette = overridesMap.get(slotId)
    if (palette) {
      sortedOverrides[slotId] = palette
    }
  }

  return {
    version: CLOUD_THEME_SETTINGS_VERSION,
    themeMode: mode,
    customThemeColors: canonicalizeThemePalette(standaloneSource, true),
    factoryThemeOverrides: sortedOverrides,
  }
}

export function cloudThemeSettingsEquals(
  a?: CloudThemeSettings | null,
  b?: CloudThemeSettings | null
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  try {
    return JSON.stringify(normalizeCloudThemeSettings(a)) === JSON.stringify(normalizeCloudThemeSettings(b))
  } catch {
    return false
  }
}

const DEFAULT_NORMALIZED_CLOUD_THEME_JSON = JSON.stringify(
  normalizeCloudThemeSettings({
    version: CLOUD_THEME_SETTINGS_VERSION,
    themeMode: 'solarized-dark',
    customThemeColors: DEFAULT_CUSTOM_COLORS,
    factoryThemeOverrides: {},
  })
)

export function isCustomizedThemeSettings(settings?: CloudThemeSettings | null): boolean {
  if (!settings) return false
  try {
    return JSON.stringify(normalizeCloudThemeSettings(settings)) !== DEFAULT_NORMALIZED_CLOUD_THEME_JSON
  } catch {
    return false
  }
}

export function readCloudThemeSettings(storage: Pick<Storage, 'getItem'> = localStorage): CloudThemeSettings | undefined {
  const rawMode = storage.getItem(SETTINGS_KEYS.themeMode)
  const rawColors = storage.getItem(SETTINGS_KEYS.customThemeColors)
  const rawOverrides = storage.getItem(SETTINGS_KEYS.factoryThemeOverrides)
  const rawStandalone = storage.getItem(STANDALONE_PALETTE_KEY)

  if (rawMode === null && rawColors === null && rawOverrides === null && rawStandalone === null) {
    return undefined
  }

  let parsedColors: CustomThemeColors | undefined
  if (rawColors !== null) {
    try {
      parsedColors = JSON.parse(rawColors) as CustomThemeColors
    } catch {
      throw new Error('customThemeColors: malformed JSON in local storage')
    }
  }

  let parsedOverrides: FactoryThemeOverrides | undefined
  if (rawOverrides !== null) {
    try {
      parsedOverrides = JSON.parse(rawOverrides) as FactoryThemeOverrides
    } catch {
      throw new Error('factoryThemeOverrides: malformed JSON in local storage')
    }
  }

  let parsedStandalone: CustomThemeColors | undefined
  if (rawStandalone !== null) {
    try {
      parsedStandalone = JSON.parse(rawStandalone) as CustomThemeColors
    } catch {
      throw new Error('standaloneCustomThemeColors: malformed JSON in local storage')
    }
    const standaloneErrors = validateBackupSettings({ customThemeColors: parsedStandalone })
    if (standaloneErrors.length > 0 || parsedStandalone?.identity) {
      throw new Error(standaloneErrors[0] || 'standaloneCustomThemeColors: must not carry factory identity')
    }
  }

  const candidate: Partial<CloudThemeSettings> = {
    version: CLOUD_THEME_SETTINGS_VERSION,
    ...(rawMode !== null ? { themeMode: rawMode as ThemeMode } : {}),
    ...(parsedColors !== undefined ? { customThemeColors: parsedColors } : parsedStandalone !== undefined ? { customThemeColors: parsedStandalone } : {}),
    ...(parsedOverrides !== undefined ? { factoryThemeOverrides: parsedOverrides } : {}),
  }

  const normalized = normalizeCloudThemeSettings(candidate)
  if (parsedColors?.identity && parsedStandalone !== undefined) {
    return {
      ...normalized,
      customThemeColors: canonicalizeThemePalette(parsedStandalone, true),
    }
  }
  return normalized
}

export function tryReadCloudThemeSettings(storage: Pick<Storage, 'getItem'> = localStorage): CloudThemeSettings | undefined {
  try {
    return readCloudThemeSettings(storage)
  } catch {
    return undefined
  }
}

export function normalizeFactoryThemeOverrides(overrides: unknown): FactoryThemeOverrides {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return {}
  const valid: FactoryThemeOverrides = {}
  for (const [id, palette] of Object.entries(overrides)) {
    if (
      id !== 'custom' &&
      THEME_MODES.includes(id as ThemeMode) &&
      palette &&
      typeof palette === 'object' &&
      !validateBackupSettings({ factoryThemeOverrides: { [id]: palette } }).length
    ) {
      valid[id as Exclude<ThemeMode, 'custom'>] = normalizeCustomThemeColors(palette as CustomThemeColors)
    }
  }
  return valid
}

export function validateAppearanceSnapshot(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['appearanceState: must be an object']
  }
  const obj = value as Record<string, unknown>
  const errors: string[] = []
  if (obj.version !== APPEARANCE_STATE_VERSION) {
    errors.push('appearanceState.version: unsupported schema version')
  }
  if (!obj.themeMode || !THEME_MODES.includes(obj.themeMode as ThemeMode)) {
    errors.push('appearanceState.themeMode: unsupported theme')
  }
  errors.push(...validateBackupSettings({
    themeMode: obj.themeMode as ThemeMode,
    customThemeColors: obj.customThemeColors,
    factoryThemeOverrides: obj.factoryThemeOverrides,
  }))
  return errors
}

export function readAppearanceSnapshot(storage: Pick<Storage, 'getItem'> = localStorage): AppearanceSnapshot | null {
  try {
    const raw = storage.getItem(SETTINGS_KEYS.appearance)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const errors = validateAppearanceSnapshot(parsed)
    if (errors.length > 0) return null
    return {
      version: APPEARANCE_STATE_VERSION,
      themeMode: parsed.themeMode as ThemeMode,
      customThemeColors: canonicalizeThemePalette(parsed.customThemeColors, true),
      factoryThemeOverrides: normalizeFactoryThemeOverrides(parsed.factoryThemeOverrides),
    }
  } catch {
    return null
  }
}

/**
 * Reads authoritative appearance state snapshot or migrates existing valid Batch 5 settings.
 *
 * Migration limitations for historically corrupt state:
 * Older versions that crashed during multi-key writes without atomic snapshots
 * cannot be retroactively disambiguated if leftover keys contain valid JSON.
 * However, any keys with malformed JSON, invalid color tokens, invalid identities,
 * or prototype pollution are safely isolated, rejected, and defaulted.
 */
export function migrateOrReadAppearance(
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage
): AppearanceSnapshot {
  const snapshot = readAppearanceSnapshot(storage)
  if (snapshot) return snapshot

  // Legacy Batch 5 migration
  let mode: ThemeMode = 'solarized-dark'
  let overrides: FactoryThemeOverrides = {}
  let standalone: CustomThemeColors = normalizeCustomThemeColors()

  try {
    const rawMode = storage.getItem(SETTINGS_KEYS.themeMode)
    if (rawMode && (THEME_MODES as readonly string[]).includes(rawMode)) {
      mode = rawMode as ThemeMode
    }

    const rawOverrides = storage.getItem(SETTINGS_KEYS.factoryThemeOverrides)
    if (rawOverrides) {
      try {
        const parsed = JSON.parse(rawOverrides)
        overrides = normalizeFactoryThemeOverrides(parsed)
      } catch { /* Malformed JSON ignored */ }
    }

    const rawColors = storage.getItem(SETTINGS_KEYS.customThemeColors)
    let parsedColors: CustomThemeColors | undefined
    if (rawColors) {
      try {
        const parsed = JSON.parse(rawColors)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          if (!validateBackupSettings({ customThemeColors: parsed }).length) {
            parsedColors = parsed as CustomThemeColors
          }
        }
      } catch { /* Malformed JSON ignored */ }
    }

    const rawStandalone = storage.getItem(STANDALONE_PALETTE_KEY)
    let parsedStandalone: CustomThemeColors | undefined
    if (rawStandalone) {
      try {
        const parsed = JSON.parse(rawStandalone)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !parsed.identity) {
          if (!validateBackupSettings({ customThemeColors: parsed }).length) {
            parsedStandalone = parsed as CustomThemeColors
          }
        }
      } catch { /* Malformed JSON ignored */ }
    }

    if (parsedStandalone) {
      standalone = normalizeCustomThemeColors(parsedStandalone)
    } else if (parsedColors && !parsedColors.identity) {
      standalone = normalizeCustomThemeColors(parsedColors)
    }

    if (parsedColors?.identity) {
      const slot = parsedColors.identity.factoryId
      if (!overrides[slot]) {
        overrides[slot] = normalizeCustomThemeColors(parsedColors)
      }
      if (mode === 'custom') {
        mode = slot
      }
    }
  } catch { /* Fallback */ }

  const migrated: AppearanceSnapshot = {
    version: APPEARANCE_STATE_VERSION,
    themeMode: mode,
    customThemeColors: canonicalizeThemePalette(standalone, true),
    factoryThemeOverrides: overrides,
  }

  return migrated
}

function applyCloudThemePaletteToDocument(mode: ThemeMode, colors: CustomThemeColors): void {
  if (typeof document === 'undefined') return
  if (document.body) {
    document.body.classList.remove(...THEME_MODES.map(theme => `theme-${theme}`))
    document.body.classList.add('theme-custom')
    document.body.dataset.theme = mode
  }
  const root = document.documentElement
  if (!root || !root.style) return
  applyFontSettings(colors.fonts, root)
  for (const [key, value] of Object.entries({
    ...typographyDefaults(colors),
    ...headerDefaults(colors),
    actionColor: colors.actionColor!,
    selectionColor: colors.selectionColor!,
    sectionIconColor: colors.sectionIconColor!,
  })) {
    root.style.setProperty('--custom-' + key, value)
  }
  root.style.setProperty('--custom-stage-bg', colors.bgHex)
  root.style.setProperty('--custom-stage-text', colors.textHex)
  root.style.setProperty('--custom-stage-chord', colors.chordHex)
  root.style.setProperty('--custom-stage-section', colors.sectionHex)
  // Surface & border calculations based on bg brightness (backward compatibility)
  const hex = colors.bgHex.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16) || 0
  const g = parseInt(hex.substring(2, 4), 16) || 0
  const b = parseInt(hex.substring(4, 6), 16) || 0
  const isLight = (r * 299 + g * 587 + b * 114) / 1000 > 150
  root.style.colorScheme = isLight ? 'light' : 'dark'

  if (isLight) {
    root.style.setProperty(
      '--custom-stage-surface',
      `rgb(${Math.max(0, r - 15)}, ${Math.max(0, g - 15)}, ${Math.max(0, b - 15)})`
    )
    root.style.setProperty(
      '--custom-stage-border',
      `rgb(${Math.max(0, r - 45)}, ${Math.max(0, g - 45)}, ${Math.max(0, b - 45)})`
    )
  } else {
    root.style.setProperty(
      '--custom-stage-surface',
      `rgb(${Math.min(255, r + 16)}, ${Math.min(255, g + 16)}, ${Math.min(255, b + 16)})`
    )
    root.style.setProperty(
      '--custom-stage-border',
      `rgb(${Math.min(255, r + 38)}, ${Math.min(255, g + 38)}, ${Math.min(255, b + 38)})`
    )
  }
  root.style.setProperty('--custom-chrome-header-bg', colors.headerBg || DEFAULT_CUSTOM_COLORS.headerBg!)
  root.style.setProperty('--custom-chrome-toolbar-bg', colors.toolbarBg || DEFAULT_CUSTOM_COLORS.toolbarBg!)
  root.style.setProperty('--custom-chrome-search-bg', colors.searchBg || DEFAULT_CUSTOM_COLORS.searchBg!)
  root.style.setProperty('--custom-chrome-search-border', colors.searchBorder || DEFAULT_CUSTOM_COLORS.searchBorder!)
  root.style.setProperty('--custom-chrome-filter-bg', colors.filterBarBg || DEFAULT_CUSTOM_COLORS.filterBarBg!)
  root.style.setProperty('--custom-chrome-icon', colors.iconColor || DEFAULT_CUSTOM_COLORS.iconColor!)
  root.style.setProperty('--custom-card-setlist-bg', colors.setlistCardBg || DEFAULT_CUSTOM_COLORS.setlistCardBg!)
  root.style.setProperty('--custom-card-song-bg', colors.songCardBg || DEFAULT_CUSTOM_COLORS.songCardBg!)
  root.style.setProperty('--custom-card-border', colors.cardBorder || DEFAULT_CUSTOM_COLORS.cardBorder!)
  root.style.setProperty('--custom-card-selected-bg', colors.selectedCardBg || DEFAULT_CUSTOM_COLORS.selectedCardBg!)
  root.style.setProperty('--custom-card-selected-border', colors.selectedCardBorder || DEFAULT_CUSTOM_COLORS.selectedCardBorder!)
  root.style.setProperty('--custom-control-button-bg', colors.buttonBg || DEFAULT_CUSTOM_COLORS.buttonBg!)
  root.style.setProperty('--custom-control-button-text', colors.buttonText || DEFAULT_CUSTOM_COLORS.buttonText!)
  root.style.setProperty('--custom-control-input-bg', colors.inputBg || DEFAULT_CUSTOM_COLORS.inputBg!)
  root.style.setProperty('--custom-control-input-text', colors.inputText || DEFAULT_CUSTOM_COLORS.inputText!)
  root.style.setProperty('--custom-control-input-border', colors.inputBorder || DEFAULT_CUSTOM_COLORS.inputBorder!)
  root.style.setProperty('--custom-control-accent', colors.accentColor || DEFAULT_CUSTOM_COLORS.accentColor!)
  root.style.setProperty('--custom-dock-bg', colors.dockBg || DEFAULT_CUSTOM_COLORS.dockBg!)
  root.style.setProperty('--custom-dock-border', colors.dockBorder || DEFAULT_CUSTOM_COLORS.dockBorder!)
  root.style.setProperty('--custom-dock-btn-bg', colors.dockBtnBg || DEFAULT_CUSTOM_COLORS.dockBtnBg!)
  root.style.setProperty('--custom-dock-btn-icon', colors.dockBtnIcon || DEFAULT_CUSTOM_COLORS.dockBtnIcon!)
  root.style.setProperty('--custom-dock-play-bg', colors.dockPlayBg || DEFAULT_CUSTOM_COLORS.dockPlayBg!)
  root.style.setProperty('--custom-dock-play-icon', colors.dockPlayIcon || DEFAULT_CUSTOM_COLORS.dockPlayIcon!)
}

export function persistCloudThemeSettings(
  settings: CloudThemeSettings,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage
): CloudThemeSettings {
  const normalized = normalizeCloudThemeSettings(settings)
  const prevAppearance = storage.getItem(SETTINGS_KEYS.appearance)
  const prevOverrides = storage.getItem(SETTINGS_KEYS.factoryThemeOverrides)
  const prevColors = storage.getItem(SETTINGS_KEYS.customThemeColors)
  const prevMode = storage.getItem(SETTINGS_KEYS.themeMode)
  const prevStandalone = storage.getItem(STANDALONE_PALETTE_KEY)

  const nextOverrides = normalized.factoryThemeOverrides ?? {}
  const nextStandalone = normalized.customThemeColors ?? canonicalizeThemePalette(DEFAULT_CUSTOM_COLORS, true)
  const nextModeRaw = normalized.themeMode ?? 'solarized-dark'

  const nextOverridesRaw = JSON.stringify(nextOverrides)
  const nextColorsRaw = JSON.stringify(nextStandalone)
  const snapshot: AppearanceSnapshot = {
    version: APPEARANCE_STATE_VERSION,
    themeMode: nextModeRaw,
    customThemeColors: canonicalizeThemePalette(nextStandalone, true),
    factoryThemeOverrides: nextOverrides,
  }
  const snapshotRaw = JSON.stringify(snapshot)

  const restoreKey = (key: string, prev: string | null) => {
    try {
      if (prev === null) {
        if (typeof storage.removeItem === 'function') storage.removeItem(key)
      } else {
        storage.setItem(key, prev)
      }
    } catch { /* Best-effort rollback */ }
  }

  try {
    storage.setItem(SETTINGS_KEYS.factoryThemeOverrides, nextOverridesRaw)
    storage.setItem(SETTINGS_KEYS.customThemeColors, nextColorsRaw)
    storage.setItem(SETTINGS_KEYS.themeMode, nextModeRaw)
    storage.setItem(SETTINGS_KEYS.appearance, snapshotRaw)
    if (prevStandalone !== null && typeof storage.removeItem === 'function') {
      try { storage.removeItem(STANDALONE_PALETTE_KEY) } catch { /* ignore */ }
    }
    if (
      storage.getItem(SETTINGS_KEYS.factoryThemeOverrides) !== nextOverridesRaw ||
      storage.getItem(SETTINGS_KEYS.customThemeColors) !== nextColorsRaw ||
      storage.getItem(SETTINGS_KEYS.themeMode) !== nextModeRaw ||
      storage.getItem(SETTINGS_KEYS.appearance) !== snapshotRaw
    ) {
      throw new Error('Theme settings save could not be verified in localStorage')
    }
  } catch (err) {
    restoreKey(SETTINGS_KEYS.appearance, prevAppearance)
    restoreKey(SETTINGS_KEYS.factoryThemeOverrides, prevOverrides)
    restoreKey(SETTINGS_KEYS.customThemeColors, prevColors)
    restoreKey(SETTINGS_KEYS.themeMode, prevMode)
    restoreKey(STANDALONE_PALETTE_KEY, prevStandalone)
    throw err
  }

  const activePalette =
    nextModeRaw === 'custom'
      ? normalized.customThemeColors!
      : normalized.factoryThemeOverrides?.[nextModeRaw as Exclude<ThemeMode, 'custom'>] ?? normalized.customThemeColors!
  applyCloudThemePaletteToDocument(nextModeRaw, activePalette)

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    const Evt = typeof window.Event === 'function' ? window.Event : Event
    window.dispatchEvent(new Evt(SETTINGS_CHANGED))
  }

  return normalized
}

export function readBackupSettings(storage?: Pick<Storage, 'getItem'>): BackupSettings {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return {}
  const data: BackupSettings = {}

  // Check authoritative appearance snapshot first
  const snapshot = readAppearanceSnapshot(store)
  if (snapshot) {
    data.themeMode = snapshot.themeMode
    data.customThemeColors = snapshot.customThemeColors
    if (Object.keys(snapshot.factoryThemeOverrides).length > 0) {
      data.factoryThemeOverrides = snapshot.factoryThemeOverrides
    }
  } else {
    // Fallback: isolate corrupt keys from legacy storage
    // 1. Theme Mode
    const theme = store.getItem(SETTINGS_KEYS.themeMode)
    if (theme !== null && (THEME_MODES as readonly string[]).includes(theme)) {
      data.themeMode = theme as ThemeMode
    }

    // 2. Custom Theme Colors (isolated from corrupt JSON / invalid color tokens)
    const rawColors = store.getItem(SETTINGS_KEYS.customThemeColors)
    if (rawColors !== null) {
      try {
        const parsed = JSON.parse(rawColors)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const errors = validateBackupSettings({ customThemeColors: parsed })
          if (errors.length === 0) {
            data.customThemeColors = parsed as CustomThemeColors
          } else {
            console.warn('Isolating corrupt customThemeColors from backup export:', errors)
          }
        }
      } catch {
        console.warn('Isolating malformed customThemeColors JSON from backup export')
      }
    }

    // 3. Factory Theme Overrides (isolated from corrupt JSON / invalid color tokens)
    const rawOverrides = store.getItem(SETTINGS_KEYS.factoryThemeOverrides)
    if (rawOverrides !== null) {
      try {
        const parsed = JSON.parse(rawOverrides)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const errors = validateBackupSettings({ factoryThemeOverrides: parsed })
          if (errors.length === 0) {
            data.factoryThemeOverrides = parsed as FactoryThemeOverrides
          } else {
            console.warn('Isolating corrupt factoryThemeOverrides from backup export:', errors)
          }
        }
      } catch {
        console.warn('Isolating malformed factoryThemeOverrides JSON from backup export')
      }
    }
  }

  // Stage Settings
  const stage: Record<string, unknown> = {}
  for (const key of ['fontStyle', 'fontSizePx', 'scrollSpeed', 'isTwoColumn'] as const) {
    const value = store.getItem(SETTINGS_KEYS[key])
    if (value !== null) {
      try {
        stage[key] = key === 'fontStyle' ? value : JSON.parse(value)
      } catch {
        // ignore malformed scalar setting
      }
    }
  }
  if (Object.keys(stage).length) {
    const stageErrors = validateBackupSettings({ stageSettings: stage })
    if (stageErrors.length === 0) {
      data.stageSettings = stage as BackupSettings['stageSettings']
    } else {
      console.warn('Isolating corrupt stageSettings from backup export:', stageErrors)
    }
  }

  return data
}

export function restoreBackupSettings(settings: BackupSettings, storage?: Pick<Storage, 'setItem' | 'getItem'>, notify = true) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return
  // Validate the whole object first; never write a valid prefix of malformed settings.
  const errors = validateBackupSettings(settings as Record<string, unknown>)
  if (errors.length) throw new Error(errors.join('\n'))

  const current = migrateOrReadAppearance(store as Pick<Storage, 'getItem' | 'setItem'>)
  const nextMode = settings.themeMode || current.themeMode
  const nextOverrides = settings.factoryThemeOverrides !== undefined ? settings.factoryThemeOverrides : current.factoryThemeOverrides
  const nextStandalone = settings.customThemeColors !== undefined ? normalizeCustomThemeColors(settings.customThemeColors) : current.customThemeColors

  const snapshot: AppearanceSnapshot = {
    version: APPEARANCE_STATE_VERSION,
    themeMode: nextMode,
    customThemeColors: canonicalizeThemePalette(nextStandalone, true),
    factoryThemeOverrides: nextOverrides,
  }

  if (settings.factoryThemeOverrides !== undefined) store.setItem(SETTINGS_KEYS.factoryThemeOverrides, JSON.stringify(settings.factoryThemeOverrides))
  if (settings.themeMode !== undefined) store.setItem(SETTINGS_KEYS.themeMode, settings.themeMode)
  if (settings.customThemeColors !== undefined) store.setItem(SETTINGS_KEYS.customThemeColors, JSON.stringify(settings.customThemeColors))
  store.setItem(SETTINGS_KEYS.appearance, JSON.stringify(snapshot))

  for (const [key, value] of Object.entries(settings.stageSettings ?? {})) {
    store.setItem(SETTINGS_KEYS[key as keyof typeof settings.stageSettings], String(value))
  }
  if (notify && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    const Evt = typeof window.Event === 'function' ? window.Event : Event
    window.dispatchEvent(new Evt(SETTINGS_CHANGED))
  }
}
