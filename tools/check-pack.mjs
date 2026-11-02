#!/usr/bin/env node
/**
 * Package-content contract (T5.1).
 *
 * `npm pack --dry-run` answered the acceptance question for T5.1 ("内容正确、无源码泄漏"), but
 * reading the tarball listing by eye does not survive the next change to `files`. This script
 * asks npm the same question and pins the answer, the way check-tokens.mjs pins the token layer:
 *
 *   1. every file the plugin needs at runtime is in the tarball — both halves of the bundle,
 *      the patch manifest, both locale dictionaries, the icon, README and LICENSE;
 *   2. nothing the repository keeps private is in it — no src/, no tests, no docs, and above
 *      all no .map: a source map embeds the whole TypeScript source in sourcesContent, which
 *      would undo every other effort here;
 *   3. the manifest still declares what the host reads — dsh.bundle.patch, the three client
 *      services in dsh.client.inject, the exports map, and the compatibility fields.
 *
 * Usage: node tools/check-pack.mjs      (also part of `pnpm verify`)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))

/** Files the host loads, or a user reads, at runtime. Missing any of these is a broken package. */
const REQUIRED = [
  'package.json',
  'lib/index.js',
  'lib/client.js',
  'cordis.patch.yml',
  'locale/en.json',
  'locale/zh.json',
  'icon.svg',
  'README.md',
  'LICENSE',
]

/**
 * What must never ship. The extension-based rules matter more than the directory ones: a stray
 * .ts or .map is exactly what a future `files: ["lib/"]` rewrite would let through unnoticed.
 */
const FORBIDDEN = [
  { pattern: /^src\//, why: 'source tree' },
  { pattern: /^tests\//, why: 'unit tests' },
  { pattern: /^tools\//, why: 'derivation and verification scripts' },
  { pattern: /^docs\//, why: 'internal documentation' },
  { pattern: /^tasks\//, why: 'local task files' },
  { pattern: /^build\//, why: 'build presets' },
  { pattern: /^node_modules\//, why: 'dependencies' },
  { pattern: /\.map$/, why: 'source maps embed the full TypeScript source' },
  { pattern: /\.tsx?$/, why: 'TypeScript sources' },
  { pattern: /^tsconfig/, why: 'compiler configuration' },
  { pattern: /^tsdown\.config/, why: 'build configuration' },
  { pattern: /^pnpm-lock\.yaml$/, why: 'lockfile' },
  { pattern: /^\./, why: 'dotfiles' },
]

/** Upper bounds: the bundle is ~57 KB, so anything near these numbers means something crept in. */
const MAX_FILES = 12
const MAX_UNPACKED_BYTES = 300 * 1024

const failures = []
let checks = 0
const check = (name, ok, detail) => {
  checks += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail === undefined ? '' : ' — ' + detail))
  if (!ok) failures.push(name)
}

const manifest = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))

/** Ask npm what it would ship. --dry-run writes nothing, so this is safe inside pnpm verify. */
function packListing() {
  const stdout = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: REPO,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // The shape moved between npm majors: 9 answers with an array of entries, 10+ answers
  // with one object keyed by package name. Accept both rather than pin a version.
  const start = stdout.search(/[[{]/)
  if (start < 0) throw new Error('npm pack printed no JSON: ' + stdout.slice(0, 200))
  const closing = stdout[start] === '{' ? '}' : ']'
  const parsed = JSON.parse(stdout.slice(start, stdout.lastIndexOf(closing) + 1))
  const entry = Array.isArray(parsed) ? parsed.at(-1) : (Object.hasOwn(parsed, 'files') ? parsed : Object.values(parsed).at(-1))
  if (entry === undefined || !Array.isArray(entry.files)) throw new Error('npm pack JSON had no file list')
  return entry
}

const packed = packListing()
const paths = packed.files.map((file) => file.path).sort()
console.log('info ' + packed.name + '@' + packed.version + ': ' + packed.entryCount + ' entries, '
  + (packed.size / 1024).toFixed(1) + ' KB packed, ' + (packed.unpackedSize / 1024).toFixed(1) + ' KB unpacked')
for (const entry of packed.files) {
  console.log('     ' + entry.path.padEnd(22) + (entry.size / 1024).toFixed(1).padStart(7) + ' KB')
}

// --- 1. the package is complete ---------------------------------------------
for (const path of REQUIRED) {
  check(path + ' is in the tarball', paths.includes(path))
}

// --- 2. nothing private is in it --------------------------------------------
const leaked = []
for (const path of paths) {
  // Report the first rule that matches: one file cannot be two kinds of leak, and a list
  // where every source file appears twice reads like twice the problem.
  const rule = FORBIDDEN.find((candidate) => candidate.pattern.test(path))
  if (rule !== undefined) leaked.push(path + ' (' + rule.why + ')')
}
check('nothing private is in the tarball', leaked.length === 0, leaked.join(', '))
check('the file count stays bounded', packed.entryCount <= MAX_FILES, packed.entryCount + ' of ' + MAX_FILES)
check('the unpacked size stays bounded', packed.unpackedSize <= MAX_UNPACKED_BYTES,
  (packed.unpackedSize / 1024).toFixed(1) + ' KB of ' + (MAX_UNPACKED_BYTES / 1024) + ' KB')

// --- 3. the manifest still says what the host reads -------------------------
const client = manifest.dsh === undefined ? undefined : manifest.dsh.client
check('the bundle patch is declared', manifest.dsh?.bundle?.patch === './cordis.patch.yml',
  String(manifest.dsh?.bundle?.patch))
check('three client services are injected', Array.isArray(client?.inject) && client.inject.length === 3,
  JSON.stringify(client?.inject))
check('the client half is marked web', client?.platform === 'web', String(client?.platform))
check('the exports map resolves both halves',
  manifest.exports?.['.'] === './lib/index.js' && manifest.exports?.['./client'] === './lib/client.js',
  JSON.stringify(manifest.exports))
check('engines.dsh binds the runtime range', typeof manifest.engines?.dsh === 'string',
  String(manifest.engines?.dsh))
const dependencies = manifest.dependencies ?? {}
check('the host runtime stays a peer, not a dependency',
  Object.hasOwn(manifest.peerDependencies ?? {}, '@deepseek-ai/cordis') && !Object.hasOwn(dependencies, '@deepseek-ai/cordis'),
  JSON.stringify({ peer: manifest.peerDependencies ?? {}, dependencies }))
check('no runtime dependency is bundled', Object.keys(dependencies).length === 0, JSON.stringify(dependencies))
check('license and description are set', manifest.license === 'MIT' && (manifest.description ?? '').length > 20,
  manifest.license + ' / ' + (manifest.description ?? '').length + ' chars')

console.log('')
console.log(failures.length === 0 ? 'all package-content checks passed (' + checks + ' checks)' : failures.length + ' check(s) failed')
process.exit(failures.length === 0 ? 0 : 1)
