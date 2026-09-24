import type { HirSurfaceKind } from "./hir";

/**
 * The names a bare-body surface binds without declaring them. Apart from
 * `user-code-form.ts` because the printer needs them in the browser, and
 * that module pulls in the TypeScript compiler.
 */

/** Surfaces whose code may be either an `export default <Ctor>(...)` module
 * or a bare function body (metric and scenario surfaces are bare-body only). */
export type DualFormSurfaceKind = Extract<
  HirSurfaceKind,
  "dynamics" | "lambda" | "kernel"
>;

/**
 * Ambient input-object names for the bare-body form — the names the docs
 * teach and the LSP's body wrapper declares. `parameters` is ambient in
 * every bare body.
 */
export const AMBIENT_INPUT_NAMES: Record<DualFormSurfaceKind, string> = {
  dynamics: "tokens",
  lambda: "input",
  kernel: "input",
};
