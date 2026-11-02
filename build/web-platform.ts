/**
 * Browser platform modules shared by the shell's frozen module table.
 * Every entry stays external in the client bundle — a value import of any
 * other @deepseek-ai/* package is a build error (see the purity gate).
 */
export const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
] as const

export type PlatformModule = (typeof PLATFORM_MODULES)[number]
