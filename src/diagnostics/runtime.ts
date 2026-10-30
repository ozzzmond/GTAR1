import { createDiagnosticSession, type DiagnosticCode } from './core'

// Resolved by Vite from GTAR1's existing app environment. PROD removes the
// session implementation; runtime flags cannot enable it.
export const diagnostics = import.meta.env.GTAR1_DEV_DIAGNOSTICS
  ? createDiagnosticSession(import.meta.env.GTAR1_APP_VERSION) : null

export function recordDiagnostic(code: DiagnosticCode) {
  if (import.meta.env.GTAR1_DEV_DIAGNOSTICS) diagnostics?.record(code)
}
