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
  SIDEBAR_MATERIALS,
  getAccent,
  getSidebarMaterial,
  setAccent,
  setSidebarMaterial,
  stepAccent,
  subscribeAccent,
  subscribeSidebarMaterial,
  type SidebarMaterial,
} from './state.ts'
import { SETTINGS_NS } from './strings.ts'
import styles from './settings.module.css'

/**
 * Entry key inside `settings.general.item`. A fresh id is added beside the
 * shipped rows; reusing a shipped id would replace that row instead.
 */
const ROW_ID = 'dsh-theme-mist'

/**
 * Element id the accent group points `aria-labelledby` at.
 *
 * Both groups are labelled by their visible title rather than by an
 * `aria-label`, so the accessible name and the painted text can never drift
 * apart — and the id doubles as the hook the dual-version e2e counts our rows
 * with (`[aria-labelledby^="dsh-theme-mist-"]`), which keeps that assertion independent
 * of the interface language.
 */
const ACCENT_TITLE_ID = 'dsh-theme-mist-accent-title'

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
 * Entry key for the sidebar material choice (T5.8). Its own row, like every
 * shipped entry: the accent strip is already 111px tall, and one setting per row
 * is what every shipped entry does.
 */
const SIDEBAR_ROW_ID = 'dsh-theme-mist-sidebar-material'

/**
 * Sits one tenth below the accent row and still above `transcript-view` (12), so
 * the two rows this plugin contributes stay adjacent whatever else loads.
 */
const SIDEBAR_ROW_ORDER = 11.7

/** Element id the choice's group points `aria-labelledby` at. */
const SIDEBAR_TITLE_ID = 'dsh-theme-mist-sidebar-title'

/** Translator handed to the component by the host because the row declares `locale`. */
type Translate = (key: string) => string

/**
 * Inline custom properties that carry both halves of one accent's swatch colour.
 * `light-dark()` in the stylesheet decides which one the current scheme uses.
 */
type SwatchStyle = CSSProperties & {
  readonly '--dsh-theme-mist-seed-light': string
  readonly '--dsh-theme-mist-seed-dark': string
}

/**
 * Adapter between our store and `useSyncExternalStore`: the store notifies with
 * the new accent, React wants a zero-argument change callback. Module scope
 * keeps the reference stable, so the subscription is not rebuilt per render.
 */
const subscribe = (onChange: () => void): (() => void) => subscribeAccent(() => { onChange() })

/** Same adapter for the sidebar material choice. */
const subscribeSidebar = (onChange: () => void): (() => void) => subscribeSidebarMaterial(() => { onChange() })

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
      <div className={styles.title} id={ACCENT_TITLE_ID}>{t('accent.title')}</div>
      <div className={styles.options} role="radiogroup" aria-labelledby={ACCENT_TITLE_ID}>
        {ACCENT_IDS.map((id) => {
          const selected = id === accent
          const palette = PALETTES[id]
          const swatch: SwatchStyle = {
            '--dsh-theme-mist-seed-light': palette.accent.seed,
            '--dsh-theme-mist-seed-dark': palette.accent.seedDark,
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
 * Render the sidebar material choice.
 *
 * Two options, radio semantics, and the same shape as the accent row — one Tab
 * stop, arrows move within the group — but text-only: there is nothing to
 * preview as a swatch, and the effect is visible behind the settings panel the
 * moment it changes.
 * @param props - `t`, bound to {@link SETTINGS_NS} by the slot registry.
 * @returns the row element tree.
 */
function SidebarRow({ t }: { readonly t: Translate }) {
  const material = useSyncExternalStore(subscribeSidebar, getSidebarMaterial)

  const focusOn = (id: SidebarMaterial): void => {
    const node = document.getElementById(sidebarButtonId(id))
    if (node !== null) node.focus()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
      : 0
    if (step === 0) return
    event.preventDefault()
    const index = SIDEBAR_MATERIALS.indexOf(material)
    const size = SIDEBAR_MATERIALS.length
    const next = SIDEBAR_MATERIALS[((index + step) % size + size) % size]
    setSidebarMaterial(next)
    focusOn(next)
  }

  return (
    <div className={styles.row}>
      <div className={styles.title} id={SIDEBAR_TITLE_ID}>{t('sidebar.title')}</div>
      <div className={styles.options} role="radiogroup" aria-labelledby={SIDEBAR_TITLE_ID}>
        {SIDEBAR_MATERIALS.map((id) => {
          const selected = id === material
          return (
            <button
              key={id}
              id={sidebarButtonId(id)}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={styles.option}
              onClick={() => { setSidebarMaterial(id) }}
              onKeyDown={onKeyDown}
            >
              <span className={styles.name}>{t('sidebar.' + id)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Stable element id for one sidebar option, used only to move focus.
 * @param id - material id.
 */
function sidebarButtonId(id: SidebarMaterial): string {
  return 'dsh-theme-mist-sidebar-' + id
}

/**
 * Stable element id for one swatch, used only to move focus from the keyboard.
 * @param id - accent id.
 */
function buttonId(id: AccentId): string {
  return 'dsh-theme-mist-accent-' + id
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
    id: SIDEBAR_ROW_ID,
    order: SIDEBAR_ROW_ORDER,
    locale: SETTINGS_NS,
  }, SidebarRow))
}
