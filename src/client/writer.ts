/**
 * The token-layer writer, plus the fallback that keeps the material layer alive
 * when the host cannot override tokens (T4.2).
 *
 * Normally the host theme owns `overrideTokens`: it resolves every
 * `{ light, dark }` pair for the active colour scheme and rewrites body's inline
 * style on each theme change. A host without that method is one we cannot move
 * official tokens on — but the material layer only needs our own `--dsh-go-*`
 * variables, and those are plain colours, so the page gradient can still paint
 * while every official token keeps its shipped value.
 *
 * The fallback therefore writes exactly those nine variables, spelled as
 * `light-dark(light, dark)`: the pair resolves against the `color-scheme` the
 * host declares on `<html>`, so the scheme switch keeps working with no
 * `theme/change` listener of our own (same mechanism as the settings swatches,
 * measured in T3.2).
 */
import type { Context } from '@deepseek-ai/cordis'
import { MATERIAL_VARS, type TokenLayer } from './tokens.ts'

/**
 * Layer identity for `overrideTokens`. One layer per source, so re-issuing with
 * the same source replaces the previous layer instead of stacking on top.
 */
export const LAYER_SOURCE = 'dsh-go-theme'

/** Prefix on every line this plugin logs, so a message names its owner. */
const LOG_PREFIX = 'dsh-go-theme: '

/** The one method this plugin needs from the host theme service. */
interface ThemeService {
  overrideTokens?: (source: string, tokens: TokenLayer) => () => void
}

/**
 * `ctx.logger` is a host service rather than cordis core, so it is read
 * structurally instead of being added to the shared `Context` augmentation.
 */
interface LoggingContext {
  logger?: { warn?: (...args: unknown[]) => void }
}

/** What {@link createLayerWriter} hands back. */
export interface LayerWriter {
  /** True when official tokens are left alone and only material vars are written. */
  readonly degraded: boolean
  /** Install the layer; the returned function removes exactly this one. */
  write(layer: TokenLayer): () => void
}

/**
 * Read `ctx.theme` without trusting that the service is there.
 * Accessing an uninjected cordis service throws; treat that as absent rather
 * than letting a capability probe take the plugin down.
 * @param ctx - client root context.
 * @returns the theme service, or `undefined` when it is not readable.
 */
function readTheme(ctx: Context): ThemeService | undefined {
  try {
    return (ctx as unknown as { theme?: ThemeService }).theme
  } catch {
    return undefined
  }
}

/**
 * Write only the `--dsh-go-*` material variables straight onto body.
 *
 * Values go in as `light-dark(light, dark)` pairs so one write serves both
 * schemes. Whatever body already carried for those nine names is captured first
 * and restored on teardown, so two mounts cannot leave each other's values
 * behind.
 * @param body - the element the host theme also writes to.
 * @param layer - a complete layer; entries missing from it are skipped.
 * @returns a disposer restoring the previous inline values.
 */
export function writeMaterialVars(body: HTMLElement, layer: TokenLayer): () => void {
  const saved = new Map<string, [value: string, priority: string]>()
  for (const name of MATERIAL_VARS) {
    const pair = layer[name]
    if (pair === undefined) continue
    saved.set(name, [body.style.getPropertyValue(name), body.style.getPropertyPriority(name)])
    body.style.setProperty(name, `light-dark(${pair.light}, ${pair.dark})`)
  }
  return () => {
    for (const [name, [value, priority]] of saved) {
      if (value === '') body.style.removeProperty(name)
      else body.style.setProperty(name, value, priority)
    }
  }
}

/**
 * Pick the writer this host can honour.
 * @param ctx - client root context.
 * @param body - the element layers are written to.
 * @returns the host writer when `overrideTokens` exists, otherwise the
 *   material-only fallback, flagged as degraded.
 */
export function createLayerWriter(ctx: Context, body: HTMLElement): LayerWriter {
  const theme = readTheme(ctx)
  const override = theme?.overrideTokens
  if (theme !== undefined && typeof override === 'function') {
    return {
      degraded: false,
      write: (layer) => override.call(theme, LAYER_SOURCE, layer),
    }
  }
  return { degraded: true, write: (layer) => writeMaterialVars(body, layer) }
}

/**
 * Say once, where a developer will see it, that this host degrades.
 * @param ctx - client root context; its `logger` is preferred over the console.
 */
export function warnDegraded(ctx: Context): void {
  const message = `${LOG_PREFIX}theme service has no overrideTokens; official tokens stay as shipped, painting the material layer only`
  const logger = (ctx as unknown as LoggingContext).logger
  if (typeof logger?.warn === 'function') logger.warn(message)
  else console.warn(message)
}
