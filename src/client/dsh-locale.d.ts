/**
 * Ambient declaration for the DSH client locale service.
 *
 * The registrar contract is documented in `dsh-client-locale/README.zh.md:40`:
 * both base locales (`zh` and `en`) are mandatory — a namespace missing either
 * one fails to register. Dictionaries registered after the UI mounted still
 * apply without a remount.
 *
 * The namespace itself is typed against `LocaleNamespaceMap`, a declaration
 * merged by the packages that own UI. An external plugin has no part in that
 * map, so the namespace stays a plain string here.
 */
export type LocaleDictionary = Readonly<Record<string, string>>

export interface DshLocaleService {
  /**
   * Register one namespace's dictionaries.
   * @param namespace - namespace id; must be stable across versions.
   * @param dictionaries - keyed by locale id; `zh` and `en` are required.
   * @returns a disposer removing the dictionaries.
   */
  register(namespace: string, dictionaries: Readonly<Record<string, LocaleDictionary>>): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Translation service, provided by `@deepseek-ai/dsh-client-locale`. */
    readonly locale: DshLocaleService
  }
}
