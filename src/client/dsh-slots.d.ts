/**
 * Ambient declaration for the DSH client slots service.
 *
 * Same situation as `dsh-theme.d.ts`: the service is contributed by a Harness
 * Client package this plugin may not import as a value, so its shape is
 * restated from the shipped contract rather than imported.
 *
 * Verified against 0.2.2-alpha.2:
 * - `settings.general.item` is `kind: "list"`, `scope: "root"`
 *   (`dsh-cordis-client-runner/lib/client.js:5286`)
 * - the only options that slot documents are `id`, `order` and `label`; the
 *   row owns its own copy, state and write path — the owner passes no props
 * - entries are ordered by `(a.order ?? 0) - (b.order ?? 0)`
 *   (`dsh-web-frontend/dist/assets/index--TtJvO-i.js`)
 * - `register` hangs its own cleanup on the calling fiber, so the returned
 *   disposer does not have to be kept
 */
export interface SlotRegisterOptions {
  /** Slot key being contributed to. */
  readonly name: string
  /** Entry key inside that slot; reuse of a shipped id replaces that entry. */
  readonly id?: string
  /** Position among the entries, ascending. */
  readonly order?: number
  /** Display text, for owners that project one (not `settings.general.item`). */
  readonly label?: string | (() => string)
  /** Namespace whose translator is handed to the component as `t`. */
  readonly locale?: string
}

export interface DshSlotsService {
  /**
   * Register once the owner slot exists; the callback's result is disposed with
   * the owning plugin.
   * @param ownerKey - slot key this registration depends on.
   * @param callback - performs the registration.
   */
  inject(ownerKey: string, callback: () => (() => void) | void): () => void
  /**
   * Contribute one entry.
   * @param options - slot key, entry id, position and locale.
   * @param component - React component; receives `t` when `locale` is set.
   * @returns a disposer, also hung on the calling fiber.
   */
  register<Props extends object>(options: SlotRegisterOptions, component: (props: Props) => unknown): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Client slot registry, provided by the shell's slots runtime. */
    readonly slots: DshSlotsService
  }
}
