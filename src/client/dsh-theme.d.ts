/**
 * Ambient declaration for the DSH client theme service.
 *
 * `@deepseek-ai/cordis` ships a bare Context; each DSH service augments it at
 * its own package boundary. The theme service lives in
 * `@deepseek-ai/dsh-client-ui-theme`, which a client plugin may not import as a
 * value (see the bundle purity gate in build/tsdown.client.ts) — so its shape is
 * declared here from the measured behaviour rather than imported.
 *
 * Verified against 0.2.1-alpha.1 and 0.2.2-alpha.2 in phase 0:
 * docs/reference/phase0-findings.md §1.
 */
export interface ThemeTokenPair {
  readonly light: string
  readonly dark: string
}

export interface ThemeSnapshotActive {
  readonly id: string
  readonly colorScheme: 'light' | 'dark'
  /**
   * Built-in palettes carry no token map here — their values come from the base
   * stylesheets. Only registered/overridden tokens show up.
   */
  readonly tokens: Readonly<Record<string, string>>
}

export interface ThemeSnapshot {
  readonly preference: string
  readonly active: ThemeSnapshotActive
  readonly themes: readonly { readonly id: string }[]
}

export interface DshThemeService {
  /**
   * Stack a partial token layer over the active theme.
   * @returns a disposer removing exactly the layer this call created.
   */
  overrideTokens(source: string, tokens: Readonly<Record<string, ThemeTokenPair>>): () => void
  /** Register a third-party theme definition. */
  register(definition: unknown): () => void
  /** Set the durable theme preference (`light` | `dark` | `system`). */
  setTheme(id: string): void
  readonly preference: string
  readonly themes: readonly { readonly id: string }[]
  readonly snapshot: ThemeSnapshot
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Client theme registry, provided by `@deepseek-ai/dsh-client-ui-theme`. */
    readonly theme: DshThemeService

    /**
     * Register a lifecycle effect; the returned disposer tears it down.
     *
     * **Why this is declared here and not inherited:** cordis 4.0.5 augments
     * `Context` from inside `fiber.d.ts` via `declare module './context.ts'`.
     * That relative specifier does not resolve from a consumer's compile — the
     * package ships only `context.d.ts`, and neither `bundler` nor `nodenext`
     * module resolution reaches it (both measured). The runtime method exists and
     * works, so the shape is restated here from the shipped declaration
     * (`fiber.d.ts:157`). Effect return values are never consumed by this
     * plugin, so only the registration form is declared.
     */
    effect(execute: () => (() => void) | void, label?: string): () => void
  }
}
