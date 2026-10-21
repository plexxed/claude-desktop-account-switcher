import { t } from './strings'

// The band's line has room for `bodyColumns` and no way to measure what it
// draws, so each layout's width is reckoned from the strings it would show,
// and the band takes the fullest layout that fits. The app's proportional face
// is reckoned by each character's width in ems, so the sum is an estimate.

/** What the band shows, from the fullest down. */
export type Layout = { hasBars: boolean; hasResets: boolean; isWide: boolean; limitCount: number }

/** One figure as it would be drawn: its label, value and countdown. */
export type FigureText = { label: string | null; value: string; countdown: string | null; hasBar: boolean }

/**
 * How a string is set: `text`, the band's footnote; `figure`, its semibold
 * figures; `body`, the Accounts pane and buttons; `picker`, the picker's label.
 */
export type Role = 'text' | 'figure' | 'body' | 'picker'

// Measured off the desktop app, where a column is about 10px (a band of 78
// columns is about 790px wide): the footnote's em is about 15px, the picker's
// 16px; a bar is about 50px, a lg gap 25px, the picker's chevron with its
// padding 45px, a button's padding 16px.
const SIZES = {
  // Columns per em of each role.
  em: { text: 1.5, figure: 1.575, body: 1.72, picker: 1.63 } satisfies Record<Role, number>,
  bar: 5,
  gap: { xs: 0.8, md: 1.2, lg: 2.5 },
  // The picker's chevron and padding.
  pickerChrome: 4.5,
  // The narrowest the picker's name is cut to: about "very long accou…".
  pickerNameMin: 7.8 * 1.63,
  // A Button's padding around its label.
  buttonPadding: 1.6,
  // Columns the band holds back from `bodyColumns`, for what the sum misses:
  // each part of a full band at 67 columns came within a column of its sum, yet
  // the picker ran 3 columns into the figures (the band's own padding at its
  // ends, likely, counted in `bodyColumns`).
  bandMargin: 3,
  // The same for an account's card: a limits summary with countdowns was cut by
  // about two columns at a width its sum said it fit (its tabular digits and "↻"
  // run wider than reckoned).
  rowMargin: 3,
  // Columns an account's card takes around its name line: the list's padding
  // (2), the card's frame and padding (about 30px), its 32px avatar and the gap
  // after it (about 45px).
  cardChrome: 9.5,
}

// --- Text width in a proportional face -------------------------------------------
// The picker's list cuts its options at a width, not a count of characters: it
// showed 43 characters of one option and 40 of another, both about 20em. So a
// string is measured by its characters' classes, in ems of the app's face. The
// classes hold for any script: a capital of any alphabet is as wide as a Latin
// one, and the ideographs and syllables of East Asian scripts, and emoji, take
// a whole em.

const NARROW = /[ilj.,:;|!'I\u0456\u0457]/u
const THIN = /[ frt()[\]\-·/]/u
// CJK punctuation and full-width forms too, and the sharing checkboxes.
const WIDE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\u3000-\u303f\uff01-\uff60\u2610\u2611]/u
// Latin m and w, and the Cyrillic letters as broad as they are.
const BROAD = /[mwMW%\u2014\u0436\u0448\u0449\u042e\u0416\u0428\u0429\u0444\u0424]/u

function charEms(ch: string) {
  if (WIDE.test(ch)) return 1
  if (NARROW.test(ch)) return 0.27
  if (THIN.test(ch)) return 0.33
  if (/\p{Nd}/u.test(ch)) return 0.56
  if (BROAD.test(ch)) return 0.85
  if (/[…↻]/u.test(ch)) return 0.8
  if (/\p{Lu}/u.test(ch)) return 0.66
  return 0.52
}

/** A string's width in ems of the app's proportional face, estimated. */
export function textEms(text: string) {
  return [...text].reduce((sum, ch) => sum + charEms(ch), 0)
}

/** Columns `text` takes, set as `role`. */
export function textColumns(role: Role, text: string) {
  return textEms(text) * SIZES.em[role]
}

/** `text` whole when it is at most `max` wide, else cut to fit with "…" last; `width` measures. */
function cutTo(text: string, max: number, width: (text: string) => number) {
  if (width(text) <= max) {
    return text
  }
  let cut = ''
  for (const ch of text) {
    if (width(`${cut}${ch}${t('text.ellipsis')}`) > max) {
      break
    }
    cut += ch
  }

  return `${cut.trimEnd()}${t('text.ellipsis')}`
}

/** `text` whole when it is at most `maxEms` wide, else cut to fit with "…" last. */
export function cutToEms(text: string, maxEms: number) {
  return cutTo(text, maxEms, textEms)
}

// --- Account rows ---------------------------------------------------------------

/** Columns an account's card leaves its name line out of `columns`. */
export function cardColumns(columns: number) {
  return columns - SIZES.cardChrome
}

/** Columns a Button takes: its label, set as the app's body text, and its padding. */
function buttonColumns(label: string) {
  return textColumns('body', label) + SIZES.buttonPadding
}

/** Columns a line of words side by side takes, such as an account's name and its badge; `isBody` as for `rowFits`. */
export function wordsColumns(isBody: boolean, words: string[]) {
  const role = isBody ? 'body' : 'text'

  return words.reduce((sum, word) => sum + textColumns(role, word), 0) + SIZES.gap.md * Math.max(0, words.length - 1)
}

/**
 * Whether an account's row fits on one line in `columns`: its longest line of
 * text beside its buttons, a gap between. A line is a string, set as `isBody`
 * says, or the columns it was reckoned to take. When it doesn't fit, the
 * buttons go on a line of their own, under the text, rather than past the edge.
 */
export function rowFits(columns: number, lines: (string | number)[], buttons: string[], isBody: boolean) {
  const role = isBody ? 'body' : 'text'
  const text = Math.max(0, ...lines.map(line => (typeof line === 'number' ? line : textColumns(role, line))))
  const controls = buttons.reduce((sum, label) => sum + buttonColumns(label), 0) + SIZES.gap.xs * Math.max(0, buttons.length - 1)

  return text + SIZES.gap.md + controls <= columns - SIZES.rowMargin
}

/** Columns a hint card needs to keep its longest line on one row: its text, padding and border. */
export function hintColumns(lines: string[]) {
  return Math.ceil(Math.max(0, ...lines.map(line => textColumns('text', line)))) + 4
}

// --- The band -------------------------------------------------------------------

function figureColumns(figure: FigureText, layout: Layout) {
  const parts = [
    figure.label === null ? null : textColumns('text', figure.label),
    layout.hasBars && figure.hasBar ? SIZES.bar : null,
    textColumns('figure', figure.value),
    layout.hasResets && figure.countdown ? textColumns('text', figure.countdown) : null,
  ].filter((one): one is number => one !== null)

  return parts.reduce((sum, one) => sum + one, 0) + SIZES.gap.xs * (parts.length - 1)
}

/** Columns the whole line takes in `layout`: the figures, the gap, the picker showing `picker`. */
export function lineColumns(figures: FigureText[], picker: string, layout: Layout) {
  // The context first, then as many limits as the layout keeps.
  const shown = figures.slice(0, 1 + layout.limitCount)
  const gap = layout.isWide ? SIZES.gap.lg : SIZES.gap.md
  const metrics = shown.reduce((sum, figure) => sum + figureColumns(figure, layout), 0) + gap * (shown.length - 1)

  return metrics + SIZES.gap.md + SIZES.pickerChrome + textColumns('picker', picker)
}

/**
 * The fullest layout whose line fits in `columns`, with the picker's name cut
 * to its narrowest: first the wide gaps narrow, then the bars go, then the
 * reset countdowns, then every limit but the first. A figure is dropped whole,
 * never clipped; the last step is drawn even when it does not fit.
 *
 * Then the picker's name takes what the figures leave, up to the whole name.
 */
export function fitBand(columns: number, figures: FigureText[], pickerName: string) {
  const cutPicker = (max: number) => cutTo(pickerName, max, text => textColumns('picker', text))
  const narrowest = cutPicker(SIZES.pickerNameMin)
  const limits = Math.max(0, figures.length - 1)
  const steps: Layout[] = [
    { hasBars: true, hasResets: true, isWide: true, limitCount: limits },
    { hasBars: true, hasResets: true, isWide: false, limitCount: limits },
    { hasBars: false, hasResets: true, isWide: true, limitCount: limits },
    { hasBars: false, hasResets: false, isWide: true, limitCount: limits },
    { hasBars: false, hasResets: false, isWide: false, limitCount: limits },
    { hasBars: false, hasResets: false, isWide: false, limitCount: Math.min(1, limits) },
  ]
  const room = columns - SIZES.bandMargin
  const layout = steps.find(step => lineColumns(figures, narrowest, step) <= room) ?? steps[steps.length - 1]!
  // A column to spare, against the estimate running short.
  const spare = room - lineColumns(figures, narrowest, layout) - 1
  const pickerLabel = spare > 0 ? cutPicker(textColumns('picker', narrowest) + spare) : narrowest

  return { layout, pickerLabel }
}
