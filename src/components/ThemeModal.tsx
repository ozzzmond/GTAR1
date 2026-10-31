import { normalizeFontSettings, applyFontSettings } from '../utils/customFonts'
import {
  SETTINGS_KEYS,
  SETTINGS_CHANGED,
  validateBackupSettings,
  THEME_MODES,
  APPEARANCE_STATE_VERSION,
  STANDALONE_PALETTE_KEY,
  migrateOrReadAppearance,
  readAppearanceSnapshot,
  type AppearanceSnapshot,
  type FactoryThemeOverrides,
} from '../utils/backupSettings'
import React, { useState, useEffect, useRef } from 'react'
import {
  X,
  Check,
  Palette,
  Sliders,
  Layout,
  Layers,
  SlidersHorizontal,
  PlaySquare,
} from 'lucide-react'
import { CustomPaletteEditor } from './CustomPaletteEditor'
import { presetToCustomPalette } from '../utils/customPaletteJson'
export { CustomPaletteEditor }
export { presetToCustomPalette }

import type { ThemeMode, CustomThemeColors } from '../utils/backupSettings'
export type { ThemeMode, CustomThemeColors } from '../utils/backupSettings'

export interface ThemeOption {
  id: ThemeMode
  name: string
  subtitle?: string
  bgHex: string
  surfaceHex: string
  accentHex: string
  textHex: string
  tag?: string
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
  // STAGE
  bgHex: '#121820',
  textHex: '#F1F5F9',
  chordHex: '#F59E0B',
  sectionHex: '#A78BFA',

  // APP_CHROME
  headerBg: '#1A222D',
  headerPrimaryText: '#F1F5F9',
  headerSecondaryText: '#CBD5E1',
  headerIconColor: '#94A3B8',
  toolbarBg: '#121820',
  searchBg: '#121820',
  searchBorder: '#2A3644',
  filterBarBg: '#1A222D',
  iconColor: '#94A3B8',

  // CARDS_AND_BOXES
  setlistCardBg: '#1A222D',
  songCardBg: '#1A222D',
  cardBorder: '#2A3644',
  selectedCardBg: '#22313F',
  selectedCardBorder: '#38BDF8',

  // CONTROLS
  buttonBg: '#24303E',
  buttonText: '#F1F5F9',
  inputBg: '#121820',
  inputText: '#F1F5F9',
  inputBorder: '#2A3644',
  accentColor: '#F59E0B',

  // STAGE_FLOATING_CONTROLS
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

// Derive legacy header colors against the header surface, independently of the body.
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
  if (!colors) return { ...DEFAULT_CUSTOM_COLORS }
  return {
    ...DEFAULT_CUSTOM_COLORS,
    ...colors,
    ...typographyDefaults(colors),
    ...headerDefaults(colors),
    ...surfaceDefaults(colors),
    actionColor: colors.actionColor || colors.uiLinkText || '#2AA198',
    selectionColor: colors.selectionColor || colors.selectedCardBorder || '#2AA198',
    sectionIconColor: colors.sectionIconColor || colors.iconColor || '#2AA198',
    ...(colors.identity ? { identity: { ...colors.identity, displayName: colors.identity.displayName.trim() } } : {}),
    fonts: normalizeFontSettings(colors.fonts),
    bgHex: colors.bgHex || DEFAULT_CUSTOM_COLORS.bgHex,
    textHex: colors.textHex || DEFAULT_CUSTOM_COLORS.textHex,
    chordHex: colors.chordHex || DEFAULT_CUSTOM_COLORS.chordHex,
    sectionHex: colors.sectionHex || DEFAULT_CUSTOM_COLORS.sectionHex,
  }
}

export function applyCustomThemeStyles(rawColors: CustomThemeColors) {
  if (typeof document === 'undefined') return
  const colors = normalizeCustomThemeColors(rawColors)
  const root = document.documentElement

  applyFontSettings(colors.fonts, root)
  for (const [key, value] of Object.entries({ ...typographyDefaults(colors), ...headerDefaults(colors), actionColor: colors.actionColor!, selectionColor: colors.selectionColor!, sectionIconColor: colors.sectionIconColor! })) {
    root.style.setProperty('--custom-' + key, value)
  }

  const selection = colors.selectionColor!
  const channels = [1, 3, 5].map(offset => parseInt(selection.slice(offset, offset + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
  root.style.setProperty('--custom-selection-foreground', luminance > .179 ? '#000000' : '#FFFFFF')
  const actionChannels = [1, 3, 5].map(offset => parseInt(colors.actionColor!.slice(offset, offset + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  const actionLuminance = actionChannels[0] * .2126 + actionChannels[1] * .7152 + actionChannels[2] * .0722
  root.style.setProperty('--custom-action-foreground', actionLuminance > .179 ? '#000000' : '#FFFFFF')

  // STAGE
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

  // APP_CHROME
  root.style.setProperty('--custom-chrome-header-bg', colors.headerBg || DEFAULT_CUSTOM_COLORS.headerBg!)
  root.style.setProperty('--custom-chrome-toolbar-bg', colors.toolbarBg || DEFAULT_CUSTOM_COLORS.toolbarBg!)
  root.style.setProperty('--custom-chrome-search-bg', colors.searchBg || DEFAULT_CUSTOM_COLORS.searchBg!)
  root.style.setProperty('--custom-chrome-search-border', colors.searchBorder || DEFAULT_CUSTOM_COLORS.searchBorder!)
  root.style.setProperty('--custom-chrome-filter-bg', colors.filterBarBg || DEFAULT_CUSTOM_COLORS.filterBarBg!)
  root.style.setProperty('--custom-chrome-icon', colors.iconColor || DEFAULT_CUSTOM_COLORS.iconColor!)

  // CARDS_AND_BOXES
  root.style.setProperty('--custom-card-setlist-bg', colors.setlistCardBg || DEFAULT_CUSTOM_COLORS.setlistCardBg!)
  root.style.setProperty('--custom-card-song-bg', colors.songCardBg || DEFAULT_CUSTOM_COLORS.songCardBg!)
  root.style.setProperty('--custom-card-border', colors.cardBorder || DEFAULT_CUSTOM_COLORS.cardBorder!)
  root.style.setProperty('--custom-card-selected-bg', colors.selectedCardBg || DEFAULT_CUSTOM_COLORS.selectedCardBg!)
  root.style.setProperty('--custom-card-selected-border', colors.selectedCardBorder || DEFAULT_CUSTOM_COLORS.selectedCardBorder!)

  // CONTROLS
  root.style.setProperty('--custom-control-button-bg', colors.buttonBg || DEFAULT_CUSTOM_COLORS.buttonBg!)
  root.style.setProperty('--custom-control-button-text', colors.buttonText || DEFAULT_CUSTOM_COLORS.buttonText!)
  root.style.setProperty('--custom-control-input-bg', colors.inputBg || DEFAULT_CUSTOM_COLORS.inputBg!)
  root.style.setProperty('--custom-control-input-text', colors.inputText || DEFAULT_CUSTOM_COLORS.inputText!)
  root.style.setProperty('--custom-control-input-border', colors.inputBorder || DEFAULT_CUSTOM_COLORS.inputBorder!)
  root.style.setProperty('--custom-control-accent', colors.accentColor || DEFAULT_CUSTOM_COLORS.accentColor!)

  // STAGE_FLOATING_CONTROLS
  root.style.setProperty('--custom-dock-bg', colors.dockBg || DEFAULT_CUSTOM_COLORS.dockBg!)
  root.style.setProperty('--custom-dock-border', colors.dockBorder || DEFAULT_CUSTOM_COLORS.dockBorder!)
  root.style.setProperty('--custom-dock-btn-bg', colors.dockBtnBg || DEFAULT_CUSTOM_COLORS.dockBtnBg!)
  root.style.setProperty('--custom-dock-btn-icon', colors.dockBtnIcon || DEFAULT_CUSTOM_COLORS.dockBtnIcon!)
  root.style.setProperty('--custom-dock-play-bg', colors.dockPlayBg || DEFAULT_CUSTOM_COLORS.dockPlayBg!)
  root.style.setProperty('--custom-dock-play-icon', colors.dockPlayIcon || DEFAULT_CUSTOM_COLORS.dockPlayIcon!)
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    bgHex: '#002B36',
    surfaceHex: '#073642',
    accentHex: '#2AA198',
    textHex: '#EEE8D5',
    tag: 'DEFAULT',
  },
  {
    id: 'amber-stage',
    name: 'Amber Stage',
    bgHex: '#181206',
    surfaceHex: '#241c0c',
    accentHex: '#F59E0B',
    textHex: '#FFF8E7',
  },
  {
    id: 'oled-black',
    name: 'OLED Pure Black',
    bgHex: '#000000',
    surfaceHex: '#111111',
    accentHex: '#38BDF8',
    textHex: '#FFFFFF',
  },
  {
    id: 'paper-light',
    name: 'Paper Cream Light',
    bgHex: '#f4ecd8',
    surfaceHex: '#FFFDF7',
    accentHex: '#b45309',
    textHex: '#172033',
  },
  {
    id: 'crimson-stage',
    name: 'Crimson Stage',
    bgHex: '#120d0f',
    surfaceHex: '#1f1418',
    accentHex: '#E11D48',
    textHex: '#FEE2E2',
  },
  {
    id: 'azure-stage',
    name: 'Azure Stage',
    bgHex: '#0a1324',
    surfaceHex: '#11203b',
    accentHex: '#06B6D4',
    textHex: '#E0F2FE',
  },
  {
    id: 'e-ink-paper',
    name: 'E-Ink Paper',
    bgHex: '#ededed',
    surfaceHex: '#f8f8f8',
    accentHex: '#404040',
    textHex: '#111111',
  },
]

interface ThemeModalProps {
  isOpen: boolean
  onClose: () => void
  currentTheme: ThemeMode
  customColors?: CustomThemeColors
  onApplyTheme?: (theme: ThemeMode, customColors?: CustomThemeColors) => void
  onSelectTheme?: (theme: ThemeMode) => void
}

const BG_SWATCHES = ['#000000', '#0D131A', '#002B36', '#121820', '#181825', '#F4ECD8']
const TEXT_SWATCHES = ['#FFFFFF', '#EEE8D5', '#FDF6E3', '#F1F5F9', '#CBD5E1', '#111827']
const CHORD_SWATCHES = ['#B58900', '#F59E0B', '#2AA198', '#10B981', '#38BDF8', '#F43F5E']
const SECTION_SWATCHES = ['#8B5CF6', '#A78BFA', '#60A5FA', '#268BD2', '#35B8AD', '#EC4899']

const CHROME_BG_SWATCHES = ['#073642', '#1A222D', '#121820', '#0F172A', '#18181B', '#EDE4CE']
const BORDER_SWATCHES = ['#1A4A55', '#2A3644', '#334155', '#3F3F46', '#2AA198', '#DED3BA']
const ICON_SWATCHES = ['#93A1A1', '#94A3B8', '#2AA198', '#F59E0B', '#38BDF8', '#FFFFFF']
const ACCENT_SWATCHES = ['#2AA198', '#F59E0B', '#38BDF8', '#10B981', '#EC4899', '#8B5CF6']

export type PaletteSectionGroup = 'stage' | 'chrome' | 'cards' | 'controls' | 'stageControls' | 'typography'

interface PaletteGroupDef {
  id: PaletteSectionGroup
  label: string
  icon: React.ComponentType<{ className?: string }>
  fields: {
    key: Exclude<keyof CustomThemeColors, 'fonts' | 'identity'>
    label: string
    desc: string
    swatches: string[]
  }[]
}

export const PALETTE_GROUPS: PaletteGroupDef[] = [
  {
    id: 'typography', label: 'Typography', icon: Sliders,
    fields: [
      { key: 'uiPrimaryText', label: 'Primary UI Text', desc: 'Titles and major labels', swatches: TEXT_SWATCHES },
      { key: 'uiSecondaryText', label: 'Secondary UI Text', desc: 'Artists, counts and metadata', swatches: TEXT_SWATCHES },
      { key: 'uiSectionText', label: 'Section Text', desc: 'Library section headings', swatches: TEXT_SWATCHES },
      { key: 'uiMutedText', label: 'Muted Text', desc: 'Helpers and informational text', swatches: TEXT_SWATCHES },
      { key: 'uiLinkText', label: 'Link Text', desc: 'Lightweight actions and links', swatches: TEXT_SWATCHES },
    ],
  },
  {
    id: 'stage',
    label: 'Stage',
    icon: Sliders,
    fields: [
      {
        key: 'bgHex',
        label: 'Background',
        desc: 'Stage canvas & background color',
        swatches: BG_SWATCHES,
      },
      {
        key: 'textHex',
        label: 'Primary Text',
        desc: 'Song lyrics & teleprompter body',
        swatches: TEXT_SWATCHES,
      },
      {
        key: 'chordHex',
        label: 'Chord Highlight',
        desc: 'Chord notations & root accents',
        swatches: CHORD_SWATCHES,
      },
      {
        key: 'sectionHex',
        label: 'Section Header',
        desc: '[Verse], [Chorus], [Bridge] headers',
        swatches: SECTION_SWATCHES,
      },
    ],
  },
  {
    id: 'chrome',
    label: 'Chrome',
    icon: Layout,
    fields: [
      {
        key: 'headerBg',
        label: 'Header',
        desc: 'Top header shell & branding bar',
        swatches: CHROME_BG_SWATCHES,
      },
      {
        key: 'headerPrimaryText', label: 'Header Primary Text', desc: 'GTAR title in the top header', swatches: TEXT_SWATCHES,
      },
      {
        key: 'headerSecondaryText', label: 'Header Secondary Text', desc: 'Version in the top header', swatches: TEXT_SWATCHES,
      },
      {
        key: 'headerIconColor', label: 'Header Icon Color', desc: 'Neutral top-header icons; status colors stay semantic', swatches: ICON_SWATCHES,
      },
      {
        key: 'toolbarBg',
        label: 'Main Toolbar',
        desc: 'Secondary action bar & icon strip',
        swatches: BG_SWATCHES,
      },
      {
        key: 'searchBg',
        label: 'Search Bar',
        desc: 'Pill search bar background',
        swatches: BG_SWATCHES,
      },
      {
        key: 'searchBorder',
        label: 'Search Border',
        desc: 'Search bar perimeter outline',
        swatches: BORDER_SWATCHES,
      },
      {
        key: 'filterBarBg',
        label: 'Filter/Sort Bar',
        desc: 'Sort & filter toolbar container',
        swatches: CHROME_BG_SWATCHES,
      },
      {
        key: 'iconColor',
        label: 'Icon Color',
        desc: 'General navigation & toolbar icons',
        swatches: ICON_SWATCHES,
      },
    ],
  },
  {
    id: 'cards',
    label: 'Cards',
    icon: Layers,
    fields: [
      {
        key: 'setlistCardBg',
        label: 'Setlist Card',
        desc: 'Gig setlist card surface',
        swatches: CHROME_BG_SWATCHES,
      },
      {
        key: 'songCardBg',
        label: 'Song Card',
        desc: 'Song library card surface',
        swatches: CHROME_BG_SWATCHES,
      },
      {
        key: 'cardBorder',
        label: 'Card Border',
        desc: 'Default card border & dividers',
        swatches: BORDER_SWATCHES,
      },
      {
        key: 'selectedCardBg',
        label: 'Selected Card',
        desc: 'Active card background color',
        swatches: ['#22313F', '#0E3B43', '#1E293B', '#27272A', '#EEF7F6', '#002B36'],
      },
      {
        key: 'selectedCardBorder',
        label: 'Selected Border',
        desc: 'Active card border & focus ring',
        swatches: ACCENT_SWATCHES,
      },
    ],
  },
  {
    id: 'controls',
    label: 'Controls',
    icon: SlidersHorizontal,
    fields: [
      { key: 'actionColor', label: 'Action Color', desc: 'Play icons and Select, Hide, Import, Manage actions', swatches: ACCENT_SWATCHES },
      { key: 'selectionColor', label: 'Selection Color', desc: 'Songbook checkmarks and selection indicators', swatches: ACCENT_SWATCHES },
      { key: 'sectionIconColor', label: 'Section Icon Color', desc: 'Songbook, setlist and Songs Library icons', swatches: ICON_SWATCHES },
      {
        key: 'buttonBg',
        label: 'Button Background',
        desc: 'Action buttons & view toggles',
        swatches: ['#24303E', '#2AA198', '#F59E0B', '#334155', '#3F3F46', '#073642'],
      },
      {
        key: 'buttonText',
        label: 'Button Text',
        desc: 'Button labels & text color',
        swatches: TEXT_SWATCHES,
      },
      {
        key: 'inputBg',
        label: 'Input Background',
        desc: 'Text input & select dropdowns',
        swatches: BG_SWATCHES,
      },
      {
        key: 'inputText',
        label: 'Input Text',
        desc: 'Input value & dropdown text color',
        swatches: TEXT_SWATCHES,
      },
      {
        key: 'inputBorder',
        label: 'Input Border',
        desc: 'Border outline for inputs & selects',
        swatches: BORDER_SWATCHES,
      },
      {
        key: 'accentColor',
        label: 'Accent/Focus',
        desc: 'Active focus outlines & highlights',
        swatches: ACCENT_SWATCHES,
      },
    ],
  },
  {
    id: 'stageControls',
    label: 'Stage Controls',
    icon: PlaySquare,
    fields: [
      {
        key: 'dockBg',
        label: 'Dock Background',
        desc: 'Floating stage scroll dock shell',
        swatches: CHROME_BG_SWATCHES,
      },
      {
        key: 'dockBorder',
        label: 'Dock Border',
        desc: 'Dock perimeter border outline',
        swatches: BORDER_SWATCHES,
      },
      {
        key: 'dockBtnBg',
        label: 'Arrow Button Background',
        desc: 'Previous / Next jump buttons',
        swatches: BG_SWATCHES,
      },
      {
        key: 'dockBtnIcon',
        label: 'Arrow Icon',
        desc: 'Previous / Next chevron arrows',
        swatches: TEXT_SWATCHES,
      },
      {
        key: 'dockPlayBg',
        label: 'Play/Pause Background',
        desc: 'Center autoscroll FAB button',
        swatches: ACCENT_SWATCHES,
      },
      {
        key: 'dockPlayIcon',
        label: 'Play/Pause Icon',
        desc: 'Autoscroll play/pause icon color',
        swatches: ['#000000', '#FFFFFF', '#111827', '#F1F5F9', '#2AA198', '#F59E0B'],
      },
    ],
  },
]

export function loadFactoryThemeOverrides(storage?: Pick<Storage, 'getItem' | 'setItem'>): FactoryThemeOverrides {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
    if (!store) return {}
    return migrateOrReadAppearance(store).factoryThemeOverrides
  } catch { return {} }
}

/** Resolve factory slots and custom palettes through the existing semantic renderer. */
export function resolveThemePalette(
  mode: ThemeMode,
  customColors: CustomThemeColors,
  overrides: FactoryThemeOverrides = loadFactoryThemeOverrides()
): CustomThemeColors {
  if (mode === 'custom') return normalizeCustomThemeColors(customColors)
  const preset = THEME_OPTIONS.find(theme => theme.id === mode) || THEME_OPTIONS[0]
  return overrides[preset.id as Exclude<ThemeMode, 'custom'>] || presetToCustomPalette(preset)
}

export function applyThemeRuntime(
  mode: ThemeMode,
  customColors: CustomThemeColors,
  overrides?: FactoryThemeOverrides
): CustomThemeColors {
  const colors = resolveThemePalette(mode, customColors, overrides)
  if (typeof document !== 'undefined') {
    document.body.classList.remove(...THEME_MODES.map(theme => `theme-${theme}`))
    // Keep the existing CSS scope as the shared semantic renderer, independent of mode.
    document.body.classList.add('theme-custom')
    document.body.dataset.theme = mode
    applyCustomThemeStyles(colors)
  }
  return colors
}

function loadStandalonePalette(colors?: CustomThemeColors, storage?: Pick<Storage, 'getItem' | 'setItem'>): CustomThemeColors {
  if (colors && !colors.identity) return normalizeCustomThemeColors(colors)
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
    if (store) return migrateOrReadAppearance(store).customThemeColors
  } catch { /* Missing or invalid retention uses the standalone defaults. */ }
  return normalizeCustomThemeColors()
}

/** Migrate DEV.3g–3j active-palette storage without consuming standalone colors. */
export function hydrateThemeSettings(storage?: Pick<Storage, 'getItem' | 'setItem'>): {
  mode: ThemeMode
  standalone: CustomThemeColors
  overrides: FactoryThemeOverrides
} {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
    if (!store) return { mode: 'solarized-dark', standalone: normalizeCustomThemeColors(), overrides: {} }
    const snapshot = migrateOrReadAppearance(store)
    let mode = snapshot.themeMode
    const standalone = snapshot.customThemeColors
    const overrides = { ...snapshot.factoryThemeOverrides }

    // DEV.3j slot migration compatibility: If customThemeColors in legacy storage had identity, upgrade to slot and persist
    if (!readAppearanceSnapshot(store) && typeof store.setItem === 'function') {
      try {
        const rawColors = store.getItem(SETTINGS_KEYS.customThemeColors)
        const parsedColors = rawColors ? JSON.parse(rawColors) : null
        if (parsedColors?.identity) {
          const slotCandidate = parsedColors.identity.factoryId
          if (slotCandidate && slotCandidate !== 'custom' && (THEME_MODES as readonly string[]).includes(slotCandidate)) {
            const slot = slotCandidate as Exclude<ThemeMode, 'custom'>
            overrides[slot] ||= normalizeCustomThemeColors(parsedColors)
            const rawMode = store.getItem(SETTINGS_KEYS.themeMode)
            if (rawMode === 'custom') mode = slot
            store.setItem(SETTINGS_KEYS.factoryThemeOverrides, JSON.stringify(overrides))
            store.setItem(SETTINGS_KEYS.customThemeColors, JSON.stringify(standalone))
            store.setItem(SETTINGS_KEYS.themeMode, mode)
            store.setItem(SETTINGS_KEYS.appearance, JSON.stringify({
              version: APPEARANCE_STATE_VERSION,
              themeMode: mode,
              customThemeColors: standalone,
              factoryThemeOverrides: overrides,
            }))
          }
        }
      } catch { /* ignore */ }
    }

    return {
      mode,
      standalone,
      overrides,
    }
  } catch { return { mode: 'solarized-dark', standalone: normalizeCustomThemeColors(), overrides: {} } }
}

export const ThemeModal: React.FC<ThemeModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  customColors,
  onApplyTheme,
  onSelectTheme,
}) => {
  // Staged theme selection and custom colors (reverted on Cancel)
  const [stagedTheme, setStagedTheme] = useState<ThemeMode>(currentTheme)
  const [stagedCustomColors, setStagedCustomColors] = useState<CustomThemeColors>(() => {
    return normalizeCustomThemeColors(customColors)
  })
  const [standaloneColors, setStandaloneColors] = useState<CustomThemeColors>(() => loadStandalonePalette(customColors))
  const [overrides, setOverrides] = useState<FactoryThemeOverrides>({})
  const [pendingRestore, setPendingRestore] = useState<ThemeMode | null>(null)
  const [isCustomPaletteEditorOpen, setIsCustomPaletteEditorOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const lastCommitErrorRef = useRef<string | null>(null)
  const committedAppearanceRef = useRef<{
    mode: ThemeMode
    standalone: CustomThemeColors
    overrides: FactoryThemeOverrides
  }>({
    mode: currentTheme,
    standalone: normalizeCustomThemeColors(customColors),
    overrides: {},
  })

  // Synchronize internal staged state whenever modal opens or synchronized settings arrive
  useEffect(() => {
    if (isOpen) {
      const store = typeof localStorage !== 'undefined' ? localStorage : null
      const snapshot = store ? migrateOrReadAppearance(store) : {
        version: APPEARANCE_STATE_VERSION,
        themeMode: currentTheme,
        customThemeColors: normalizeCustomThemeColors(customColors),
        factoryThemeOverrides: {},
      }
      const initialOverrides: FactoryThemeOverrides = { ...snapshot.factoryThemeOverrides }
      let initialStandalone = loadStandalonePalette(customColors)
      let initialMode = snapshot.themeMode

      // Adopt active custom theme with factory identity into overrides on modal open
      if (currentTheme === 'custom' && customColors?.identity) {
        initialOverrides[customColors.identity.factoryId] = normalizeCustomThemeColors(customColors)
        initialMode = customColors.identity.factoryId
      } else if (THEME_MODES.includes(currentTheme)) {
        initialMode = currentTheme
      }

      committedAppearanceRef.current = {
        mode: initialMode,
        standalone: initialStandalone,
        overrides: { ...initialOverrides },
      }

      setStandaloneColors(initialStandalone)
      setOverrides(initialOverrides)
      setPendingRestore(null)
      setStagedTheme(initialMode)
      setStagedCustomColors(
        initialMode === 'custom'
          ? initialStandalone
          : (initialOverrides[initialMode] || initialStandalone)
      )
      setIsCustomPaletteEditorOpen(false)
      lastCommitErrorRef.current = null
      setSaveError(null)

      const handleSettingsChanged = () => {
        const nextSnapshot = migrateOrReadAppearance(localStorage)
        committedAppearanceRef.current = {
          mode: nextSnapshot.themeMode,
          standalone: nextSnapshot.customThemeColors,
          overrides: { ...nextSnapshot.factoryThemeOverrides },
        }
        setStandaloneColors(nextSnapshot.customThemeColors)
        setOverrides(nextSnapshot.factoryThemeOverrides)
        setStagedTheme(nextSnapshot.themeMode)
        setStagedCustomColors(
          nextSnapshot.themeMode === 'custom'
            ? nextSnapshot.customThemeColors
            : (nextSnapshot.factoryThemeOverrides[nextSnapshot.themeMode] || nextSnapshot.customThemeColors)
        )
      }
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener(SETTINGS_CHANGED, handleSettingsChanged)
        return () => window.removeEventListener(SETTINGS_CHANGED, handleSettingsChanged)
      }
    }
  }, [isOpen, currentTheme, customColors])

  if (!isOpen) return null

  const isStandaloneSelected = stagedTheme === 'custom' && !stagedCustomColors.identity
  const selectStandalonePalette = () => {
    setStagedTheme('custom')
    setStagedCustomColors(standaloneColors)
  }
  // The editor draft may carry identity; committed standalone storage never does.
  const commitTheme = (mode: ThemeMode, standalone: CustomThemeColors, nextOverrides: FactoryThemeOverrides): boolean => {
    // Snapshot previous values for atomic rollback
    const prevAppearance = localStorage.getItem(SETTINGS_KEYS.appearance)
    const prevOverrides = localStorage.getItem(SETTINGS_KEYS.factoryThemeOverrides)
    const prevCustomColors = localStorage.getItem(SETTINGS_KEYS.customThemeColors)
    const prevMode = localStorage.getItem(SETTINGS_KEYS.themeMode)
    const prevStandalone = localStorage.getItem(STANDALONE_PALETTE_KEY)

    const cleanStandalone = normalizeCustomThemeColors(standalone)
    const snapshot: AppearanceSnapshot = {
      version: APPEARANCE_STATE_VERSION,
      themeMode: mode,
      customThemeColors: cleanStandalone,
      factoryThemeOverrides: nextOverrides,
    }

    try {
      localStorage.setItem(SETTINGS_KEYS.factoryThemeOverrides, JSON.stringify(nextOverrides))
      localStorage.setItem(SETTINGS_KEYS.customThemeColors, JSON.stringify(cleanStandalone))
      localStorage.setItem(SETTINGS_KEYS.themeMode, mode)
      localStorage.setItem(SETTINGS_KEYS.appearance, JSON.stringify(snapshot))
      if (prevStandalone !== null && typeof localStorage.removeItem === 'function') {
        try { localStorage.removeItem(STANDALONE_PALETTE_KEY) } catch { /* ignore */ }
      }
      applyThemeRuntime(mode, cleanStandalone, nextOverrides)
    } catch (e: any) {
      console.error('Failed to commit theme to localStorage, rolling back', e)
      let rollbackSucceeded = true
      // ROLLBACK: Restore previous storage values exactly
      try {
        if (prevAppearance !== null) localStorage.setItem(SETTINGS_KEYS.appearance, prevAppearance)
        else localStorage.removeItem(SETTINGS_KEYS.appearance)

        if (prevOverrides !== null) localStorage.setItem(SETTINGS_KEYS.factoryThemeOverrides, prevOverrides)
        else localStorage.removeItem(SETTINGS_KEYS.factoryThemeOverrides)

        if (prevCustomColors !== null) localStorage.setItem(SETTINGS_KEYS.customThemeColors, prevCustomColors)
        else localStorage.removeItem(SETTINGS_KEYS.customThemeColors)

        if (prevMode !== null) localStorage.setItem(SETTINGS_KEYS.themeMode, prevMode)
        else localStorage.removeItem(SETTINGS_KEYS.themeMode)

        if (prevStandalone !== null) localStorage.setItem(STANDALONE_PALETTE_KEY, prevStandalone)
      } catch (rollbackErr) {
        rollbackSucceeded = false
        console.error('Storage rollback failed', rollbackErr)
      }

      // DO NOT reload from partially written / corrupted localStorage!
      // Restore runtime state strictly to the COMMITTED appearance:
      applyThemeRuntime(
        committedAppearanceRef.current.mode,
        committedAppearanceRef.current.standalone,
        committedAppearanceRef.current.overrides
      )
      // Preserve saved overrides in modal state
      setOverrides(committedAppearanceRef.current.overrides)

      const errorMsg = rollbackSucceeded
        ? (e?.message || 'Storage write failed (e.g. quota exceeded). Changes were rolled back.')
        : `Storage write failed and rollback could not be completed. Your active appearance was kept safe in memory, but local storage recovery is incomplete (${e?.message || 'quota exceeded'}).`

      lastCommitErrorRef.current = errorMsg
      setSaveError(errorMsg)
      return false
    }

    setOverrides(nextOverrides)
    setStagedTheme(mode)
    setStandaloneColors(cleanStandalone)
    committedAppearanceRef.current = {
      mode,
      standalone: cleanStandalone,
      overrides: nextOverrides,
    }
    lastCommitErrorRef.current = null
    setSaveError(null)
    // Factory callbacks expose the active palette, while App keeps standalone state separate.
    onApplyTheme?.(mode, resolveThemePalette(mode, standalone, nextOverrides))
    if (!onApplyTheme) onSelectTheme?.(mode)
    onClose()
    return true
  }

  const handleCancelAndClose = () => {
    applyThemeRuntime(
      committedAppearanceRef.current.mode,
      committedAppearanceRef.current.standalone,
      committedAppearanceRef.current.overrides
    )
    onClose()
  }

  const handleSaveAndApply = () => commitTheme(stagedTheme, standaloneColors, overrides)

  const handleCustomPaletteSaveAndApply = (colors: CustomThemeColors): boolean => {
    // Slot association belongs to the launch context, never imported palette metadata.
    const factoryId = stagedCustomColors.identity?.factoryId
    let success = false
    if (factoryId) {
      const palette = normalizeCustomThemeColors({ ...colors, identity: {
        factoryId, displayName: colors.identity?.displayName || stagedCustomColors.identity!.displayName,
      } })
      success = commitTheme(factoryId, standaloneColors, { ...overrides, [factoryId]: palette })
    } else {
      const standalone = { ...colors }
      delete standalone.identity
      success = commitTheme('custom', normalizeCustomThemeColors(standalone), overrides)
    }
    if (success) {
      setIsCustomPaletteEditorOpen(false)
      return true
    }
    throw new Error(lastCommitErrorRef.current || saveError || 'Storage write failed (e.g. quota exceeded). Changes were rolled back.')
  }

  return (
    <>
      <div data-testid="theme-selector" className="theme-studio fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
        <div className="w-full max-w-lg rounded-2xl bg-app-surface border border-app-border shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Modal Header */}
          <div className="px-5 py-4 border-b border-app-border flex items-center justify-between bg-app-base/70">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-app-accent/20 border border-app-accent/40 flex items-center justify-center text-app-accent">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <h2 className="ui-section-text text-sm sm:text-base font-bold ui-primary-text text-app-heading">Stage Color Theme</h2>
                <p className="text-[11px] ui-muted-text text-app-muted">Live Performance & Full-Theme Customization</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelAndClose}
              aria-label="Close without saving"
              className="p-1.5 rounded-lg ui-muted-text text-app-muted hover:text-app-heading hover:bg-app-base transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-5 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
            {/* Preset Theme Cards */}
            {THEME_OPTIONS.map((theme) => {
              const override = overrides[theme.id as Exclude<ThemeMode, 'custom'>]
              const isSelected = stagedTheme === theme.id
              const resolved = resolveThemePalette(theme.id, stagedCustomColors, overrides)
              const preview = { bgHex: resolved.bgHex, accentHex: resolved.accentColor || resolved.chordHex }
              return (
                <div
                  key={theme.id}
                  data-testid={`theme-slot-${theme.id}`}
                  onClick={() => {
                    setStagedTheme(theme.id)
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 group ${
                    isSelected
                      ? 'bg-app-base border-app-action shadow-md ring-1 ring-app-action/40'
                      : 'bg-app-base/50 border-app-border/60 hover:border-app-action/50 hover:bg-app-base'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Swatch Preview Box */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 shadow-inner relative overflow-hidden"
                        style={{
                          backgroundColor: preview.bgHex,
                          borderColor: preview.accentHex,
                        }}
                      >
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: preview.accentHex }}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-bold leading-tight ${
                              isSelected ? 'ui-primary-text text-app-heading' : 'ui-primary-text text-app-text group-hover:text-app-heading'
                            }`}
                          >
                            {override?.identity?.displayName || theme.name}
                          </span>
                          {theme.tag && (
                            <span className="ui-muted-text text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-app-surface text-app-action border border-app-border">
                              {theme.tag}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'ui-selection-indicator border-app-action bg-app-action text-app-on-action'
                            : 'border-app-border bg-app-surface group-hover:border-app-action'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  </div>

                  {override && <button type="button" data-testid={`restore-factory-${theme.id}`} className="ui-action-text text-xs underline text-app-action" onClick={e => { e.stopPropagation(); setPendingRestore(theme.id) }}>Restore Factory Theme</button>}
                  {/* Built-in Preset Customization Action */}
                  <div className="pt-2 border-t border-app-border/40 flex items-center justify-between gap-2">
                    <span className="text-[10px] ui-muted-text text-app-muted">
                      {override ? 'Customized factory theme' : 'Factory preset • Safe starting point'}
                    </span>
                    <button
                      type="button"
                      data-testid={`customize-preset-${theme.id}-btn`}
                      onClick={(e) => {
                        e.stopPropagation()
                        const clonedCustom = override || { ...presetToCustomPalette(theme), identity: { factoryId: theme.id as Exclude<ThemeMode, 'custom'>, displayName: `${theme.name} Custom` } }
                        setStagedCustomColors(clonedCustom)
                        setStagedTheme(theme.id)
                        setIsCustomPaletteEditorOpen(true)
                      }}
                      className="ui-button px-2.5 py-1 rounded-lg bg-app-surface hover:bg-app-base ui-primary-text text-app-text hover:text-app-heading border border-app-border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95 shrink-0"
                    >
                      <Sliders className="ui-action-text w-3 h-3 text-app-accent" />
                      <span>Customize This Theme</span>
                    </button>
                  </div>
                </div>
              )
            })}

            {pendingRestore && <div role="alertdialog" aria-label="Restore factory theme" className="p-3 border border-app-border rounded-xl bg-app-base">
              <p className="ui-primary-text text-xs">Delete this customization and restore the original factory theme? Save &amp; Apply commits the restoration.</p>
              <button type="button" data-testid="confirm-factory-restore" className="ui-action-text text-xs p-2" onClick={() => {
                const next = { ...overrides }; delete next[pendingRestore as Exclude<ThemeMode, 'custom'>]; setOverrides(next)
                if (stagedTheme === pendingRestore) {
                  setStagedCustomColors(standaloneColors)
                }
                setPendingRestore(null)
              }}>Restore Factory Theme</button>
              <button type="button" className="ui-secondary-text text-xs p-2" onClick={() => setPendingRestore(null)}>Cancel</button>
            </div>}
            {/* Custom Theme Option Card */}
            <div
              data-testid="custom-theme-option-card"
              onClick={() => {
                selectStandalonePalette()
              }}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 group ${
                isStandaloneSelected
                  ? 'bg-app-base border-app-action shadow-md ring-1 ring-app-action/40'
                  : 'bg-app-base/50 border-app-border/60 hover:border-app-action/50 hover:bg-app-base'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Dynamic Swatch Preview Box */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 shadow-inner relative overflow-hidden"
                    style={{
                      backgroundColor: standaloneColors.bgHex,
                      borderColor: standaloneColors.chordHex,
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded-full shadow"
                      style={{ backgroundColor: standaloneColors.chordHex }}
                    />
                    <div
                      className="absolute bottom-0 right-0 w-3 h-3 rounded-tl"
                      style={{ backgroundColor: standaloneColors.sectionHex }}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold leading-tight ${
                          isStandaloneSelected
                            ? 'ui-primary-text text-app-heading'
                            : 'ui-primary-text text-app-text group-hover:text-app-heading'
                        }`}
                      >
                        Custom Palette
                      </span>
                      <span className="ui-muted-text text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-app-surface text-app-accent border border-app-border">
                        CUSTOM
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                      isStandaloneSelected
                        ? 'ui-selection-indicator border-app-action bg-app-action text-app-on-action'
                        : 'border-app-border bg-app-surface group-hover:border-app-action'
                    }`}
                  >
                    {isStandaloneSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>
              </div>

              {/* Dedicated Editor Launch Action Button */}
              <div className="pt-2 border-t border-app-border/60 flex items-center justify-between gap-2">
                <span className="text-[11px] ui-muted-text text-app-muted">
                  Semantic colors across 6 categories + fonts
                </span>
                <button
                  type="button"
                  data-testid="open-custom-palette-editor-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    selectStandalonePalette()
                    setIsCustomPaletteEditorOpen(true)
                  }}
                  className="ui-button px-3 py-1.5 rounded-xl bg-app-button hover:bg-app-button text-app-button-text text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95 shrink-0"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Edit Palette</span>
                </button>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-3.5 border-t border-app-border bg-app-base/80 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div className="text-xs text-status-error font-medium flex items-center gap-1.5" role="alert">
              {saveError && (
                <span data-testid="theme-save-error">{saveError}</span>
              )}
            </div>
            <div className="flex items-center gap-2.5 self-end">
              <button
                type="button"
                onClick={handleCancelAndClose}
                className="ui-button px-4 py-2 rounded-xl border border-app-border bg-app-surface/60 hover:bg-app-surface ui-primary-text text-app-text hover:text-app-heading font-medium text-xs sm:text-sm cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="theme-save-apply-btn"
                onClick={handleSaveAndApply}
                className="ui-button px-4 py-2 rounded-xl bg-app-button hover:bg-app-button text-app-button-text font-semibold text-xs sm:text-sm cursor-pointer transition-all shadow-md active:scale-95 flex items-center gap-1.5"
              >
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Floating Custom Palette Editor */}
      <CustomPaletteEditor
        isOpen={isCustomPaletteEditorOpen}
        onClose={() => setIsCustomPaletteEditorOpen(false)}
        customColors={stagedCustomColors}
        onSaveAndApply={handleCustomPaletteSaveAndApply}
        externalError={saveError}
      />
    </>
  )
}
