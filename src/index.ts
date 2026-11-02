/**
 * Host half of the theme bundle.
 *
 * The theme is browser-only: every token layer, material rule and settings row
 * lives in `src/client/`. The host Loader still imports this file, so it must
 * exist and export `apply` — it is deliberately empty.
 */
export function apply(): void {}
