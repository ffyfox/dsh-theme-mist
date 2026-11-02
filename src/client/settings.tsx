/**
 * Settings row for the accent picker (stage 3).
 *
 * T3.1 owns the seat: one row inside the shipped General panel, directly under
 * the official 外观 (order 10) and 字号 (order 11) rows. The six swatches that
 * replace these placeholder buttons are T3.2; what ships here is the smallest
 * control that lets the row be exercised for real — native `<button>`s, so Tab,
 * Enter and Space work without any key handling of our own.
 *
 * Self-contained by rule: the official plugin guide forbids importing Harness
 * Client packages as modules, so this draws its own markup and reads only
 * `--dsw-*` tokens. `react` itself is not a Harness package — it is answered by
 * the shell's frozen module table, which is why the import compiles to a
 * `require("react")` the loader resolves.
 */
import type { Context } from '@deepseek-ai/cordis'
import { useSyncExternalStore } from 'react'
import { ACCENT_IDS } from './palettes.ts'
import { getAccent, setAccent, subscribeAccent } from './state.ts'
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
 * registers these orders: permission -20,
 * language 0, appearance 10, font-size 11, transcript-view 12, developer-tools
 * 15, shortcuts 16, link-opening 17, composer-enter 20, performance-usage 30,
 * session-log 90, current-version 100. The renderer sorts by
 * `(a.order ?? 0) - (b.order ?? 0)`, and a tie falls back to registration
 * order — so the planned `12` ("right under 字号") would have collided with
 * `transcript-view` and landed wherever activation happened to put us. The
 * fraction expresses the intent exactly without renumbering a shipped row.
 */
const ROW_ORDER = 11.5

/** Translator handed to the component by the host because the row declares `locale`. */
type Translate = (key: string) => string

/**
 * Adapter between our store and `useSyncExternalStore`: the store notifies with
 * the new accent, React wants a zero-argument change callback. Module scope
 * keeps the reference stable, so the subscription is not rebuilt per render.
 */
const subscribe = (onChange: () => void): (() => void) => subscribeAccent(() => { onChange() })

/**
 * Render the accent row.
 * @param props - `t`, bound to {@link SETTINGS_NS} by the slot registry.
 * @returns the row element tree.
 */
function AccentRow({ t }: { readonly t: Translate }) {
  // The selection follows our own store, not the resolved theme: the accent is a
  // preference independent of light/dark, exactly like the shipped appearance row.
  const accent = useSyncExternalStore(subscribe, getAccent)
  return (
    <div className={styles.row}>
      <div className={styles.title}>{t('accent.title')}</div>
      <div className={styles.options} role="group" aria-label={t('accent.title')}>
        {ACCENT_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.option}
            aria-pressed={id === accent}
            onClick={() => { setAccent(id) }}
          >
            {t('accent.' + id)}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Contribute the row to the General section.
 *
 * No `ctx.effect` wrapper: `slots.inject` already defers the registration until
 * the owner section exists, and `slots.register` hangs its own cleanup on the
 * calling fiber, so unloading the plugin removes the row and its styles.
 * @param ctx - client root context.
 */
export function registerSettingsRow(ctx: Context): void {
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: ROW_ID,
    order: ROW_ORDER,
    locale: SETTINGS_NS,
  }, AccentRow))
}
