import type { BoxProps, ButtonProps, TextProps } from 'claude-code'

import type { Level } from '../domain/levels'
import { t } from './strings'

// The mod's whole look, kept to the app's own. Every Box and Text the mod draws
// takes one of these presets, spread like a class (`<Box {...box.line}>`), and the
// presets name the app's tokens wherever they read well: its spacing steps, its
// weights, its theme colors (the status hues below are the one exception). Text
// comes at two sizes: footnote in the band above the prompt, the app's body size
// in the Accounts pane. Only data stays on an element: keys, a measured width, a tone.

export const box = {
  // One line: what it says on the left, its controls on the right.
  line: { justifyContent: 'space-between', alignItems: 'center', gap: 'md' },
  // Buttons and fields side by side; they keep their size, the words beside them give way.
  controls: { alignItems: 'center', gap: 'sm', flexShrink: 0 },
  // Words side by side, such as a name and its badge. Out of room, the badge goes
  // to the next line rather than squeezing the name.
  words: { alignItems: 'center', gap: 'sm', minWidth: 0, flexWrap: 'wrap' },
  // A titled group under the list, such as which accounts share sessions.
  section: { flexDirection: 'column', gap: 'xs' },
  // Choices side by side, wrapping to the next line when out of room.
  choices: { alignItems: 'center', columnGap: 'md', flexWrap: 'wrap' },
  // An account's row too narrow for its buttons beside the text: they go under it.
  stacked: { flexDirection: 'column', gap: 'xs' },
  // The Accounts view: its header, the cards, the sharing section and the footer,
  // a step apart so each reads as its own group.
  list: { flexDirection: 'column', gap: 'md', paddingX: 1 },
  // The cards, close together: they are one group.
  cards: { flexDirection: 'column', gap: 'sm' },
  // An account's card: its avatar beside what it says, framed so that one
  // account never runs into the next.
  card: {
    alignItems: 'flex-start',
    gap: 'md',
    paddingX: 'md',
    paddingY: 'sm',
    borderStyle: 'round',
    borderDimColor: true,
  },
  // What a card says, beside its avatar: it takes the rest of the width.
  cardBody: { flexDirection: 'column', flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 'xs' },
  // A card's limits, and under them when they were seen.
  usage: { flexDirection: 'column', gap: 'xs' },
  // A card's limits, side by side, a figure going to the next line when out of room.
  meters: { alignItems: 'center', columnGap: 'lg', flexWrap: 'wrap' },
  // One limit: its label, bar, figure, amount and countdown. Where the line is too
  // narrow for it whole (a monthly spend in a narrow pane), its parts wrap within it.
  meter: { alignItems: 'center', columnGap: 'xs', flexWrap: 'wrap', flexShrink: 1, minWidth: 0 },
  // A card asking a question: the question, what it costs, and under them its
  // buttons at the end of the line.
  askControls: { justifyContent: 'flex-end', alignItems: 'center', gap: 'sm', marginTop: 'xs' },
  // A name field and its Cancel, side by side: the field keeps its own width and
  // gives way only when there is too little, so Cancel stays beside it, inside the card.
  field: { alignItems: 'center', gap: 'sm', flexShrink: 1, minWidth: 0 },
  fieldSlot: { flexShrink: 1, minWidth: 0 },
  // The band's figures, wide gaps while there is room.
  metrics: { alignItems: 'center', gap: 'lg', flexShrink: 1 },
  metricsTight: { alignItems: 'center', gap: 'md', flexShrink: 1 },
  // One figure: label, bar, value, countdown. It never shrinks: when room runs
  // out the bars go, not the line breaks. It is the hover scope of its hint.
  metric: { position: 'relative', alignItems: 'center', gap: 'xs', flexShrink: 0 },
  // A figure's value keeps the room of its widest, "100%", set as `minWidth`, so
  // a changing percentage moves no bar; it sits to the right, by its bar.
  valueSlot: { justifyContent: 'flex-end', flexShrink: 0 },
  // The hint card, drawn above its figure while the pointer is on it (its `top`
  // is set by its line count), one line per row, on the inverse-text color,
  // which is the page's own background in both themes.
  hint: {
    position: 'absolute',
    flexDirection: 'column',
    top: -3,
    left: 0,
    display: 'none',
    hover: { display: 'flex' },
    borderStyle: 'round',
    borderDimColor: true,
    backgroundColor: 'inverseText',
    paddingX: 1,
  },
  // The account picker's seat: room for five characters of a name, the chevron and padding.
  picker: { flexShrink: 0, minWidth: 7, justifyContent: 'flex-end' },
} satisfies Record<string, BoxProps>

// Text roles, set apart only by what they mean, at one size per site.
function textRoles(size?: TextProps['size']) {
  return {
    body: { size },
    muted: { size, dimColor: true },
    strong: { size, weight: 'semibold' },
    // A profile's name: one line, cut at its end.
    name: { size, weight: 'semibold', wrap: 'truncate' },
    badge: { size, color: 'success' },
    // Numbers: digits of one width, so a ticking figure does not jitter.
    figure: { size, weight: 'semibold', tabular: true },
    detail: { size, dimColor: true, tabular: true, wrap: 'truncate' },
    // A question's note under a name; it may wrap.
    note: { size, dimColor: true, wrap: 'wrap' },
    // A group's title, such as the list's own or its sharing section's.
    heading: { size, weight: 'semibold' },
  } satisfies Record<string, TextProps>
}

// The band above the prompt is a compact line, so its text is a step smaller;
// the Accounts pane reads at the app's own body size.
export const texts = { band: textRoles('footnote'), pane: textRoles() }

// The app's own buttons, told apart only by its variants. Their labels stay the
// app's too (no Text child), so they match the button a name field draws itself,
// which no prop of ours reaches.
export const button = {
  // The one action a question waits for.
  primary: { variant: 'primary' },
  // A row's secondary actions (rename, delete): dim until the pointer or focus is on them.
  quiet: { dimColor: true },
  // The way out of a question: a plain secondary button, spelled out.
  secondary: { variant: 'secondary' },
} satisfies Record<string, Partial<ButtonProps>>

// --- Tones ---------------------------------------------------------------------
// One palette for the bars and the figures beside them. Bars are SVG images,
// which cannot read the theme, and the theme's own warning reads brown on a light
// page, so these hues are picked to read as green, yellow and red on both a light
// and a dark background.

export const TONE = { success: '#2f9e62', warning: '#d99a1b', error: '#d9534f' } as const satisfies Record<Level, string>

// A bar's fill: Claude Desktop's accent blue (--cds-blue-450, which its usage
// meters fill with in both themes) while the figure needs no attention, then
// its tone.
const BAR_FILL = { success: '#2a78d6', warning: TONE.warning, error: TONE.error } as const satisfies Record<Level, string>

// Spread onto a figure: neutral until it needs attention.
export function alert(tone: Level): TextProps {
  return tone === 'success' ? {} : { color: TONE[tone] }
}

// --- Avatars -------------------------------------------------------------------
// Each account's initial on a disc of its own hue, as account lists in most apps
// show them, where the surface draws SVG. The hue follows the name, so an account
// keeps its color; the signed-in one has a ring in the success tone around it,
// one never signed in is a dashed outline. Each hue holds white text in both themes.

export const AVATAR = 32

const AVATAR_HUES = ['#5b6cf0', '#0d8fd6', '#0f9488', '#c2410c', '#be185d', '#7c4ddb', '#4d7c0f', '#b45309'] as const

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

function hueOf(name: string) {
  let hash = 0
  for (const ch of name) {
    hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  }

  return AVATAR_HUES[hash % AVATAR_HUES.length]!
}

/** The first letter of `name`, upper-cased; "?" when it has none. */
export function initialOf(name: string) {
  const letter = [...name.trim()].find(ch => /[\p{L}\p{N}]/u.test(ch))

  return letter ? letter.toLocaleUpperCase() : t('avatar.noInitial')
}

export function avatarSvg(name: string, initial: string, look: 'active' | 'idle' | 'pending') {
  const size = AVATAR
  const c = size / 2
  const glyph = XML_ESCAPES[initial] ?? initial
  const hue = hueOf(name)
  // The ring sits outside the disc with a gap, so the disc is the same size in every look.
  const disc = look === 'pending' ? 11.5 : 12
  const shape =
    look === 'pending'
      ? `<circle cx="${c}" cy="${c}" r="${disc}" fill="none" stroke="${BAR.track}" stroke-width="1.5" stroke-dasharray="3 2.5"/>`
      : `<circle cx="${c}" cy="${c}" r="${disc}" fill="${hue}"/>`
  const ring = look === 'active' ? `<circle cx="${c}" cy="${c}" r="14.5" fill="none" stroke="${TONE.success}" stroke-width="3"/>` : ''
  const ink = look === 'pending' ? 'rgba(128,128,128,0.9)' : '#ffffff'

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    ring +
    shape +
    `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" fill="${ink}" ` +
    `font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="12.5" font-weight="600">${glyph}</text>` +
    '</svg>'
  )
}

// --- Bars ----------------------------------------------------------------------

export const BAR = { width: 44, height: 6, track: 'rgba(128,128,128,0.25)' } as const

export function barSvg(percent: number, tone: Level) {
  const ratio = Math.min(1, Math.max(0, percent / 100))
  const filled = ratio > 0 ? Math.max(BAR.height, Math.round(ratio * BAR.width)) : 0
  const r = BAR.height / 2

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR.width}" height="${BAR.height}" viewBox="0 0 ${BAR.width} ${BAR.height}">` +
    `<rect width="${BAR.width}" height="${BAR.height}" rx="${r}" fill="${BAR.track}"/>` +
    (filled ? `<rect width="${filled}" height="${BAR.height}" rx="${r}" fill="${BAR_FILL[tone]}"/>` : '') +
    '</svg>'
  )
}
