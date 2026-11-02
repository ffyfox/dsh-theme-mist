/**
 * Build preset for this standalone theme bundle.
 *
 * Mirrors the client half of DSH's shared `tsdown.client.ts` (no monorepo
 * extends, no build-face split — this package is a single artifact pair):
 *
 * - `lib/index.js`   Node half (ESM). The host Loader imports it; an empty
 *                      `apply()` is correct for a browser-only plugin.
 * - `lib/client.js`  Browser half (CJS closure factory). It calls
 *                      `window.__ModuleLoader__.load({ id, factory })` and
 *                      resolves externals through the injected `require`
 *                      (the loader's module table — no globals, no import map).
 *
 * `*.module.css` imports compile through lightningcss **inside** the bundle:
 * the import yields a hashed class map and the CSS text auto-injects a
 * `<style data-plugin="<id>" data-plugin-css="<id>/<file>">` tag when the
 * factory executes. The loader reclaims plugin-owned tags on unload
 * (`removeOwnedStyles`), which is why the tag must not be created anywhere
 * else.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'
import { PLATFORM_MODULES } from './web-platform.ts'

/**
 * Virtual id wrapper that keeps module CSS away from tsdown's own css pipeline
 * (which needs @tsdown/css). The suffix matters: tsdown guards on ids ending in
 * `.css`, so the virtual id must not.
 */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** Externals answered by the loader module table. */
export const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES]

/**
 * Assemble both halves of the package.
 * @param id - package name; stamped into the loader handoff and the style tags.
 * @param libEntry - node-half entries (usually `['src/index.ts']`).
 * @returns the tsdown config list: node half first, browser half second.
 */
export function clientBundle(id: string, libEntry: readonly string[]): UserConfig[] {
  const cssFiles = new Map<string, string>()

  const nodeHalf: UserConfig = {
    name: id,
    entry: [...libEntry],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    // cordis resolves at runtime from the dsh profile tree, never from this
    // repo's install; its built declarations carry .ts-suffixed relative
    // imports rolldown cannot follow, so the import stays external.
    deps: { neverBundle: ['@deepseek-ai/cordis'] },
  }

  const browserHalf: UserConfig = {
    name: `${id}/client`,
    entry: { client: 'src/client/index.ts' },
    // Both halves land in one lib/ directory; entryFileNames pins the browser
    // bundle to exactly lib/client.js, and clean must stay off or a default
    // clean would wipe the node half emitted just before it.
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    // Plugin code is fetched outside the shell's module graph, so its bundle
    // must carry the TS/TSX mapping consumed by browser profiling tools.
    sourcemap: true,
    clean: false,
    deps: {
      // The loader module table answers these; a require() it cannot answer is
      // a guaranteed runtime throw.
      neverBundle: [...CLIENT_EXTERNALS],
      // tsdown auto-externalizes package dependencies, so anything NOT in the
      // table must inline instead.
      alwaysBundle: (dependency: string) => (CLIENT_EXTERNALS.includes(dependency) ? undefined : true),
    },
    // Browser bundles inline node-idiom deps that probe process.env.NODE_ENV
    // (and `import.meta.env.MODE`, which CJS output cannot carry). Both keys
    // honor the build's NODE_ENV; artifacts default to production.
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [{
      // Bundle purity gate: platform seed entries stay external, and every
      // other @deepseek-ai/* value import is a build error — a cross-plugin
      // value import would either inline a duplicate runtime instance or
      // require a specifier the frozen module table cannot answer.
      // Cross-plugin collaboration goes through cordis services instead.
      // Type-only imports are erased by the transpiler and never reach here.
      name: 'dsh-client-bundle-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (CLIENT_EXTERNALS.includes(source)) return null
        throw new Error(
          `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS) — `
          + 'cross-plugin value imports are forbidden; collaborate through cordis services '
          + '(type-only imports are erased and never reach this gate)',
        )
      },
    }, {
      name: 'dsh-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const abs = importer !== undefined ? resolvePath(dirname(importer), source) : source
        if (!existsSync(abs)) throw new Error(`css module not found: ${source} (from ${importer ?? '<entry>'})`)
        const virtualId = CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
        cssFiles.set(virtualId, abs)
        return virtualId
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const fileId = cssFiles.get(virtualId) ?? virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        // The virtual id otherwise hides the physical stylesheet from Rolldown's watch graph.
        this.addWatchFile(fileId)
        const source = await readFile(fileId)
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap: Record<string, string> = {}
        // Sort deterministically: lightningcss's cssExports iteration order is
        // process-dependent, which would otherwise churn lib/client.js on every
        // rebuild.
        for (const [local, exp] of Object.entries(cssExports ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
          classMap[local] = exp.name
        }
        // One <style data-plugin> per module file; idempotent under re-evaluation
        // so a hot reload cannot stack duplicate tags.
        const tagId = `${id}/${basename(fileId)}`
        return [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${JSON.stringify(tagId)};`,
          "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
          "  const tag = document.createElement('style');",
          `  tag.dataset.plugin = ${JSON.stringify(id)};`,
          '  tag.dataset.pluginCss = tagId;',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
          `export default ${JSON.stringify(classMap)};`,
        ].join('\n')
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }

  return [nodeHalf, browserHalf]
}
