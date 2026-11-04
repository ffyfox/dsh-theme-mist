/**
 * Copy for the settings row (T3.1), registered as one locale namespace.
 *
 * Kept in its own module so it can be unit-tested without pulling in React —
 * the row component imports `react`, which the test runner cannot resolve
 * (react is answered by the shell's frozen module table, not by npm).
 *
 * The six accent names duplicate `PALETTES[id].label` on purpose: the `t` seat
 * resolves against the *active interface language*, while `label` is only a
 * per-palette pair of strings with no notion of which one is current.
 * `tests/strings.test.ts` pins the two together so they cannot drift.
 *
 * Both dictionaries quote upstream dsh-Go rather than translate: zh is
 * `app_zh.arb`'s `phoneAccent*` verbatim, en is `app_en.arb`'s. That is why
 * three English names (Teal / Aqua / Slate) do not spell the palette ids.
 */

/** Namespace for every string this plugin contributes. */
export const SETTINGS_NS = 'dsh-theme-mist'

/** Keys must stay in sync between every dictionary below. */
export type StringKey =
  | 'accent.title'
  | 'accent.mist'
  | 'accent.daiqing'
  | 'accent.dusk'
  | 'accent.turquoise'
  | 'accent.amber'
  | 'accent.graphite'
  | 'sidebar.title'
  | 'sidebar.sheet'
  | 'sidebar.flat'

/** Simplified Chinese dictionary. */
export const zh: Readonly<Record<StringKey, string>> = Object.freeze({
  'accent.title': '配色',
  'accent.mist': '雾蓝',
  'accent.daiqing': '黛青',
  'accent.dusk': '暮紫',
  'accent.turquoise': '松石',
  'accent.amber': '琥珀',
  'accent.graphite': '石墨',
  'sidebar.title': '侧栏材质',
  'sidebar.sheet': '玻璃',
  'sidebar.flat': '平铺',
})

/** English dictionary. Both base locales are mandatory; a missing one fails registration. */
export const en: Readonly<Record<StringKey, string>> = Object.freeze({
  'accent.title': 'Accent',
  'accent.mist': 'Mist',
  'accent.daiqing': 'Teal',
  'accent.dusk': 'Dusk',
  'accent.turquoise': 'Aqua',
  'accent.amber': 'Amber',
  'accent.graphite': 'Slate',
  'sidebar.title': 'Sidebar material',
  'sidebar.sheet': 'Glass',
  'sidebar.flat': 'Flat',
})
