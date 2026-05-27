/**
 * `@hashintel/petrinaut/sandbox-iframe` subpath entry.
 *
 * Exports the iframe-backed sandbox factory + types. Use this when you
 * need to isolate user-authored JavaScript from the host page — e.g.
 * the hash-frontend `process.page` flow, where the host CSP forbids
 * `unsafe-eval` and we run user code in a sandboxed iframe served by
 * `apps/hash-frontend/src/pages/petrinaut-sandbox.page.tsx`.
 */

export type {
  EvalSandbox,
  VisualizerHostFactory,
  VisualizerHostHandle,
  VisualizerProps,
} from "../react/eval-sandbox/interface";

export {
  createIframeSandbox,
  type CreateIframeSandboxOptions,
} from "../react/eval-sandbox/iframe";
