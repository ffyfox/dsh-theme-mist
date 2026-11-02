/**
 * Settings row for the accent picker (stage 3).
 *
 * T3.1 built the seat; T3.2 turns the placeholder buttons into a real picker:
 * one swatch per accent, a checkmark on the selected one, and radio-group
 * semantics with roving tabindex so the whole set is a single Tab stop.
 *
 * Swatch colours cannot be pinned to one mode: `seed` and `seedDark` differ
 * sharply (graphite is #2C2E32 vs #E5E8ED), and a light-mode swatch on the dark
 * panel is invisible. The host already declares `color-scheme` on <html> from the
 * resolved preference (measured: `style="color-scheme: light;"`), so the pair is
 * handed to CSS as two custom properties and `light-dark()` picks the right one —
 * no listener on theme/change, no extra global attribute.
 *
 * Self-contained by rule: the official plugin guide forbids importing Harness
 * Client packages as modules, so this draws its own markup, its own 12px
 * checkmark, and reads only `--dsw-*` tokens for chrome. `react` itself is not a
 * Harness package — it is answered by the shell's frozen module table, which is
 * why the import compiles to a `require("react")` the loader resolves.
 */
import type { Context } from '@deepseek-ai/cordis'
import { useSyncExternalStore } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ACCENT_IDS, PALETTES, type AccentId } from './palettes.ts'
import {
  getAccent,
  getReduceMaterial,
  setAccent,
  setReduceMaterial,
  stepAccent,
  subscribeAccent,
  subscribeReduceMaterial,
} from './state.ts'
import { SETTINGS_NS } from './strings.ts'
import styles from './settings.module.css'

/**
 * Entry key inside `settings.general.item`. A fresh id is added beside the
 * shipped rows; reusing a shipped id would replace that row instead.
 */
const ROW_ID = 'dsh-go-theme'

/**
 * Position inside the General column.
 *
 * Measured against 0.2.2-alpha.2 (0.2.1-alpha.1 ships the identical list), which
 * registers these orders: permission -20, language 0, appearance 10, font-size
 * 11, transcript-view 12, developer-tools 15, shortcuts 16, link-opening 17,
 * composer-enter 20, performance-usage 30, session-log 90, current-version 100.
 * The renderer sorts by `(a.order ?? 0) - (b.order ?? 0)`, and a tie falls back
 * to registration order — so the planned `12` ("right under 字号") would have
 * collided with `transcript-view` and landed wherever activation happened to put
 * us. The fraction expresses the intent exactly without renumbering a shipped row.
 */
const ROW_ORDER = 11.5

/**
 * Entry key for the transparency switch, which gets its own row (T3.4): one
 * setting per row is what every shipped entry does, and the accent strip is
 * already 111px tall.
 */
const MATERIAL_ROW_ID = 'dsh-go-reduce-material'

/**
 * Sits one tenth below the accent row and still above `transcript-view` (12),
 * so the two rows this plugin contributes stay adjacent whatever else loads.
 */
const MATERIAL_ROW_ORDER = 11.6

/** Element id the switch points `aria-labelledby` at. */
const MATERIAL_TITLE_ID = 'dsh-go-material-title'

/** Translator handed to the component by the host because the row declares `locale`. */
type Translate = (key: string) => string

/**
 * Inline custom properties that carry both halves of one accent's swatch colour.
 * `light-dark()` in the stylesheet decides which one the current scheme uses.
 */
type SwatchStyle = CSSProperties & {
  readonly '--go-seed-light': string
  readonly '--go-seed-dark': string
}

/**
 * Adapter between our store and `useSyncExternalStore`: the store notifies with
 * the new accent, React wants a zero-argument change callback. Module scope
 * keeps the reference stable, so the subscription is not rebuilt per render.
 */
const subscribe = (onChange: () => void): (() => void) => subscribeAccent(() => { onChange() })

/** Same adapter for the transparency switch. */
const subscribeMaterial = (onChange: () => void): (() => void) => subscribeReduceMaterial(() => { onChange() })

/**
 * Draw the checkmark. Ours, not a copied icon: a 12-unit viewBox stroked in
 * `currentColor`, so the same path reads on light and dark seeds.
 */
function Checkmark() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false">
      <path
        d="M2.6 6.3 4.9 8.6 9.4 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Render the accent row as a radio group.
 * @param props - `t`, bound to {@link SETTINGS_NS} by the slot registry.
 * @returns the row element tree.
 */
function AccentRow({ t }: { readonly t: Translate }) {
  // The selection follows our own store, not the resolved theme: the accent is a
  // preference independent of light/dark, exactly like the shipped appearance row.
  const accent = useSyncExternalStore(subscribe, getAccent)

  // Selection follows focus, so an arrow key both selects and moves; focusing
  // the new node keeps the roving tabindex meaningful after the re-render.
  const focusOn = (id: AccentId): void => {
    const node = document.getElementById(buttonId(id))
    if (node !== null) node.focus()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
      : 0
    if (step !== 0) {
      event.preventDefault()
      const next = stepAccent(accent, step)
      setAccent(next)
      focusOn(next)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const next = event.key === 'Home' ? ACCENT_IDS[0] : ACCENT_IDS[ACCENT_IDS.length - 1]
      setAccent(next)
      focusOn(next)
    }
  }

  return (
    <div className={styles.row}>
      <div className={styles.title}>{t('accent.title')}</div>
      <div className={styles.options} role="radiogroup" aria-label={t('accent.title')}>
        {ACCENT_IDS.map((id) => {
          const selected = id === accent
          const palette = PALETTES[id]
          const swatch: SwatchStyle = {
            '--go-seed-light': palette.accent.seed,
            '--go-seed-dark': palette.accent.seedDark,
          }
          return (
            <button
              key={id}
              id={buttonId(id)}
              type="button"
              role="radio"
              aria-checked={selected}
              // One Tab stop for the whole group; arrows move within it (APG).
              tabIndex={selected ? 0 : -1}
              className={styles.option}
              style={swatch}
              onClick={() => { setAccent(id) }}
              onKeyDown={onKeyDown}
            >
              <span className={styles.chip} aria-hidden="true">
                {selected ? <Checkmark /> : null}
              </span>
              <span className={styles.name}>{t('accent.' + id)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Render the transparency switch.
 *
 * A native button with `role="switch"`, so Space and Enter work without key
 * handling; `aria-checked` is the state, and the visible title is the name via
 * `aria-labelledby` rather than a second copy of the same string.
 * @param props - `t`, bound to {@link SETTINGS_NS} by the slot registry.
 * @returns the row element tree.
 */
function MaterialRow({ t }: { readonly t: Translate }) {
  const reduce = useSyncExternalStore(subscribeMaterial, getReduceMaterial)
  return (
    <div className={styles.switchRow}>
      <div className={styles.rowText}>
        <div className={styles.title} id={MATERIAL_TITLE_ID}>{t('material.title')}</div>
        <div className={styles.description}>{t('material.description')}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={reduce}
        aria-labelledby={MATERIAL_TITLE_ID}
        className={styles.switch}
        onClick={() => { setReduceMaterial(!reduce) }}
      >
        <span className={styles.knob} aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * Stable element id for one swatch, used only to move focus from the keyboard.
 * @param id - accent id.
 */
function buttonId(id: AccentId): string {
  return 'dsh-go-accent-' + id
}

/**
 * Contribute this plugin's rows to the General section.
 *
 * No `ctx.effect` wrapper: `slots.inject` already defers the registration until
 * the owner section exists, and `slots.register` hangs its own cleanup on the
 * calling fiber, so unloading the plugin removes the rows and their styles.
 * @param ctx - client root context.
 */
export function registerSettingsRows(ctx: Context): void {
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: ROW_ID,
    order: ROW_ORDER,
    locale: SETTINGS_NS,
  }, AccentRow))
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: MATERIAL_ROW_ID,
    order: MATERIAL_ROW_ORDER,
    locale: SETTINGS_NS,
  }, MaterialRow))
}
