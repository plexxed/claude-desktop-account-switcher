// Every word the mod shows, in one place: the hooks draw from here, and the
// tests build what they expect from here, so a wording changes in this file
// alone. A template's {slot} is filled by `t`; the debug log's lines are the
// developer's, not the person's, and stay where they are written.
//
// The words are a catalog per language: English is the one that defines the
// keys and their slots, and another language's catalog must give every key
// (Catalog), so a missing translation fails the type check.
//
// A message that counts has a form per plural category of the language
// (`<key>.one`, `<key>.other`, as Intl.PluralRules names them; English needs
// those two, another language may add `.few`, `.many` and the rest), and
// `plural` picks the form for its count, which fills its {count} slot.
//
// The switcher script's own messages (its log, its errors, shown as toasts)
// are in scripts/en-US/AccountSwitcher.psd1.

const EN_US = {
  // --- Actions ------------------------------------------------------------------
  'action.switch': 'Switch',
  'action.delete': 'Delete',
  'action.cancel': 'Cancel',
  'action.rename': 'Rename',
  'action.save': 'Save',
  'action.add': 'Add',
  'action.done': 'Done',
  'action.addAccount': '+ Add account',
  'icon.rename': '✎',
  'icon.delete': '🗑',
  'icon.cancel': '✕',

  // --- The Accounts list --------------------------------------------------------
  'accounts.title': 'Accounts',
  'account.unnamed': 'This account',
  'card.active': '● Active',
  'card.avatarActive': '{name}, signed in now',
  'card.noSavedSignIn': 'No saved sign-in · Switch to sign in',
  'card.updated': 'Updated {ago}',
  'card.noWindow': 'No 5-hour or weekly limits on this plan',
  'card.noUsage': 'No usage seen yet',
  'accounts.unreadable': 'The saved accounts can’t be read right now. Start a new session to have the switcher write their list again.',
  'name.placeholder': 'e.g. work',
  'name.rules': 'A name can’t start with - or a space, end with a space or dot, or contain < > : " / \\ | ? * (up to {max} characters).',
  'name.taken': '“{name}” already exists.',
  'name.invalid': '“{name}” can’t be a profile name. {rules}',
  'toggle.invalid': '“{word}” is neither on nor off.',
  'switch.question': 'Switch to {name}?',
  'switch.note': 'Claude restarts and running tasks stop.',
  'switch.noteSignIn': 'Claude restarts to the sign-in screen and running tasks stop.',
  'switch.nameFirst': 'Name this account first ({icon}), so its sign-in is kept.',
  'delete.question': 'Delete {name}?',
  'delete.noteSignIn': 'Its saved sign-in is removed from this computer.',
  'delete.noteNoSignIn': 'No saved sign-in',
  'share.heading': 'Shared sessions',
  'share.note': "Ticked accounts see each other's Code sessions, from the next switch.",
  'share.ticked': '☑ {name}',
  'share.unticked': '☐ {name}',
  'toast.failed': 'Account switcher: {message}',
  'script.exit': 'exit {code}',
  'script.notRun': 'The switcher could not run: {message}',
  // How a switch handed to a run outside Claude ended, while Claude stayed open.
  'handOff.notStarted': 'The switch did not start; nothing was changed.',
  'handOff.failedUnsaid': 'The switch failed; switcher.log in the switcher’s data folder says why.',
  'handOff.timedOut.one':
    'Claude did not close within {count} minute; switcher.log in the switcher’s data folder says how the switch went.',
  'handOff.timedOut.other':
    'Claude did not close within {count} minutes; switcher.log in the switcher’s data folder says how the switch went.',
  // While a command the person gave runs, in place of what would start another.
  'busy.switch': 'Switching to {name}…',
  'busy.new': 'Adding {name} and switching to it…',
  'busy.delete': 'Deleting {name}…',
  'busy.rename': 'Renaming {name}…',
  'busy.add': 'Adding {name}…',
  'busy.save': 'Saving {name}…',
  'busy.share': 'Changing how {name} shares sessions…',

  // --- The band -------------------------------------------------------------------
  'picker.option': '{name} — {status}',
  'picker.noSignIn': 'No saved sign-in',
  'picker.manage': 'Manage accounts…',
  'context.name': 'Context',
  'context.value': '{used} / {window}',
  'context.none': '—',
  'context.hint': 'Context: {used} of {window} · {percent}% used',
  'context.hintEmpty': 'Context: no figures yet',
  'context.hintEmptyNote': 'Filled in after the first reply',
  'context.compactsAt': 'Auto-compacts at {tokens}',

  // --- Limits -----------------------------------------------------------------------
  'limit.percent': '{percent}%',
  'limit.percentUsed': '{percent}% used',
  'limit.named': '{name}: {figures}',
  'limit.countdown': '↻{countdown}',
  'limit.resets': 'Resets {at}',
  'limit.resetsIn': 'Resets {at} (in {countdown})',
  'limit.summary': '{label} {value}',
  'limit.summaryResets': '{label} {value} ↻{countdown}',
  // Each kind of limit (limits.ts): its short label in the band and on a card,
  // and its full name where the server gives none.
  'limit.fiveHour.label': '5h',
  'limit.fiveHour.name': '5-hour limit',
  'limit.sevenDay.label': '7d',
  'limit.sevenDay.name': 'Weekly limit',
  'limit.cinderCove.label': 'Credit',
  'limit.cinderCove.name': 'Claude Code and Cowork credit',
  'limit.wattleEmber.label': 'Credit',
  'limit.wattleEmber.name': 'Credit',
  'limit.extraUsage.label': 'Spend',
  'limit.extraUsage.name': 'Monthly spend',
  'limit.spendLimit.label': 'Spend',
  'limit.spendLimit.name': 'Spend limit',
  'spend.capped': '{used} of {limit}',
  'spend.uncapped': '{used} spent',
  // Parts of a figure or of a list of them.
  'list.separator': ' · ',
  'text.ellipsis': '…',
  'avatar.noInitial': '?',

  // --- Numbers and times ---------------------------------------------------------------
  'tokens.thousands': '{n}k',
  'tokens.millions': '{n}M',
  'duration.minutes': '{m}m',
  'duration.hours': '{h}h',
  'duration.hoursMinutes': '{h}h {m}m',
  'duration.days': '{d}d',
  'duration.daysHours': '{d}d {h}h',
  'ago.now': 'just now',
  'ago.minutes': '{n}m ago',
  'ago.hours': '{n}h ago',
  'ago.days': '{n}d ago',
  'clock.tomorrow': 'tomorrow {time}',
  'clock.weekday': '{day} {time}',
} as const

export type StringKey = keyof typeof EN_US

/** The messages that count: the keys whose `.other` form English gives, without it. */
type PluralKey = { [K in StringKey]: K extends `${infer Base}.other` ? Base : never }[StringKey]

/** A language's words: every key, in that language, and the plural forms its language has beyond English's. */
type Catalog = { readonly [K in StringKey]: string } & { readonly [K in `${PluralKey}.${Intl.LDMLPluralRule}`]?: string }

const CATALOGS: Readonly<Record<string, Catalog>> = { 'en-US': EN_US }

/**
 * The catalog for `locale`: its own, else one of its language, else English.
 * The switcher script picks its messages otherwise, by the language of
 * Windows' display (Import-LocalizedData reads $PSUICulture), where `locale` is
 * the one the hooks environment formats in: with English alone the two agree,
 * and a second language must first settle which one both follow.
 */
function catalogLocale(locale: string) {
  const language = locale.split('-')[0]

  return Object.hasOwn(CATALOGS, locale) ? locale : (Object.keys(CATALOGS).find(one => one.split('-')[0] === language) ?? 'en-US')
}

/** The locale the person's system speaks, as the hooks environment knows it, where the mod has words for it. */
export const LOCALE = catalogLocale(Intl.DateTimeFormat().resolvedOptions().locale)

/** The words `t` reads: LOCALE's catalog. */
const STRINGS: Catalog = CATALOGS[LOCALE] ?? EN_US

const PLURAL_RULES = new Intl.PluralRules(LOCALE)

/** The {slots} of a template, as a union of their names. */
type Slots<T extends string> = T extends `${string}{${infer Slot}}${infer Rest}` ? Slot | Slots<Rest> : never

type SlotsOf<K extends StringKey> = Slots<(typeof EN_US)[K]>

/** The keys of the strings that have no slots, which `t` takes alone. */
export type PlainKey = { [K in StringKey]: [SlotsOf<K>] extends [never] ? K : never }[StringKey]

/** What fills a template: nothing for one without slots, else a value for each slot. */
type Fill<K extends StringKey> = [SlotsOf<K>] extends [never] ? [] : [values: Record<SlotsOf<K>, string | number>]

/** What fills a counting message beside its count: nothing when {count} is its one slot. */
type PluralFill<B extends PluralKey> = [Exclude<SlotsOf<`${B}.other` & StringKey>, 'count'>] extends [never]
  ? []
  : [values: Record<Exclude<SlotsOf<`${B}.other` & StringKey>, 'count'>, string | number>]

/** `template`'s slots filled from `values`; a slot `values` has no value for stays as it is. */
function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (slot, name: string) => (Object.hasOwn(values, name) ? String(values[name]) : slot))
}

/** The string `key` names, its slots filled from `values`. */
export function t<K extends StringKey>(key: K, ...[values]: Fill<K>): string {
  const template: string = STRINGS[key]

  return values ? fill(template, values) : template
}

/** The form of counting message `key` that `count` takes in LOCALE's language, its {count} and other slots filled. */
export function plural<B extends PluralKey>(key: B, count: number, ...[values]: PluralFill<B>): string {
  const forms: Partial<Record<string, string>> = STRINGS
  const template = forms[`${key}.${PLURAL_RULES.select(count)}`] ?? STRINGS[`${key}.other` as StringKey]

  return fill(template, { ...(values as Record<string, string | number> | undefined), count: new Intl.NumberFormat(LOCALE).format(count) })
}

/**
 * The text of template `key` before and after its slot `slot`, for a line that
 * sets the slot's value in a style of its own ("Switch to **home**?").
 */
export function around<K extends StringKey>(key: K, slot: SlotsOf<K>): [string, string] {
  const template: string = STRINGS[key]
  const at = template.indexOf(`{${slot}}`)

  return [template.slice(0, at), template.slice(at + slot.length + 2)]
}
