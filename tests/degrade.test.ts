/**
 * Capability fallback (T4.2).
 *
 * The interesting behaviour is not "does it render" but "what exactly does a
 * host without `overrideTokens` still get": our nine material variables, not a
 * single official token touched, one warning, and a teardown that leaves body's
 * inline style the way it found it.
 */
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { PALETTES } from '../src/client/palettes.ts'
import { MATERIAL_VARS, buildTokenLayer } from '../src/client/tokens.ts'
import { LAYER_SOURCE, createLayerWriter, warnDegraded } from '../src/client/writer.ts'

/**
 * A body element carrying just the style surface the writer uses.
 * `getPropertyPriority` is part of the contract because the restore path has to
 * put an `!important` back, not drop it.
 */
function fakeBody(): HTMLElement {
  const values = new Map<string, { value: string; priority: string }>()
  const style = {
    getPropertyValue: (name: string): string => values.get(name)?.value ?? '',
    getPropertyPriority: (name: string): string => values.get(name)?.priority ?? '',
    setProperty: (name: string, value: string, priority = ''): void => {
      values.set(name, { value, priority })
    },
    removeProperty: (name: string): void => {
      values.delete(name)
    },
  }
  return { style } as unknown as HTMLElement
}

const LAYER = buildTokenLayer(PALETTES.mist)

describe('createLayerWriter', () => {
  it('hands the layer to the host writer when overrideTokens exists', () => {
    const calls: Array<{ source: string; layer: unknown }> = []
    const disposer = (): void => {}
    const ctx = {
      theme: {
        overrideTokens: (source: string, layer: unknown): (() => void) => {
          calls.push({ source, layer })
          return disposer
        },
      },
    } as unknown as Context

    const writer = createLayerWriter(ctx, fakeBody())

    expect(writer.degraded).toBe(false)
    // The host's own disposer is the one the caller gets back, unwrapped.
    expect(writer.write(LAYER)).toBe(disposer)
    expect(calls).toHaveLength(1)
    expect(calls[0].source).toBe(LAYER_SOURCE)
    expect(calls[0].layer).toBe(LAYER)
  })

  it('writes only the material variables when the method is missing', () => {
    const body = fakeBody()
    const writer = createLayerWriter({ theme: {} } as unknown as Context, body)

    expect(writer.degraded).toBe(true)
    const revert = writer.write(LAYER)

    const pair = LAYER['--dsh-theme-mist-page-base']
    expect(body.style.getPropertyValue('--dsh-theme-mist-page-base')).toBe(
      `light-dark(${pair.light}, ${pair.dark})`,
    )
    for (const name of MATERIAL_VARS) {
      expect(body.style.getPropertyValue(name)).toMatch(/^light-dark\(/)
    }
    // The official contract is untouched: no token is overridden by hand.
    expect(body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('')
    expect(body.style.getPropertyValue('--dsw-specific-sidebar-fill')).toBe('')
    expect(body.style.getPropertyValue('--dsw-alias-brand-primary')).toBe('')

    revert()
    for (const name of MATERIAL_VARS) expect(body.style.getPropertyValue(name)).toBe('')
  })

  it('restores an inline value that was already there', () => {
    const body = fakeBody()
    body.style.setProperty('--dsh-theme-mist-glow', 'rgba(1, 2, 3, 0.5)', 'important')
    const writer = createLayerWriter({ theme: {} } as unknown as Context, body)

    const revert = writer.write(LAYER)

    expect(body.style.getPropertyValue('--dsh-theme-mist-glow')).toMatch(/^light-dark\(/)
    expect(body.style.getPropertyPriority('--dsh-theme-mist-glow')).toBe('')

    revert()

    expect(body.style.getPropertyValue('--dsh-theme-mist-glow')).toBe('rgba(1, 2, 3, 0.5)')
    expect(body.style.getPropertyPriority('--dsh-theme-mist-glow')).toBe('important')
  })

  it('treats an unreadable theme service as absent', () => {
    const ctx = {
      get theme(): never {
        throw new Error('cannot get property "theme" without inject')
      },
    } as unknown as Context

    expect(createLayerWriter(ctx, fakeBody()).degraded).toBe(true)
  })

  it('treats a non-function overrideTokens as absent', () => {
    const ctx = { theme: { overrideTokens: 'nope' } } as unknown as Context

    expect(createLayerWriter(ctx, fakeBody()).degraded).toBe(true)
  })
})

describe('warnDegraded', () => {
  it('prefers the host logger', () => {
    const warn = vi.fn()
    warnDegraded({ logger: { warn } } as unknown as Context)

    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0][0])
    expect(message).toContain('dsh-theme-mist: ')
    expect(message).toContain('overrideTokens')
  })

  it('falls back to the console when the host has no logger', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnDegraded({} as unknown as Context)

    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
