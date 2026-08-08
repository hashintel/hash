/**
 * WebGPU capability detection, deliberately dependency-free.
 *
 * This lives apart from the rest of `webgpu/` because UI needs to ask "is a GPU
 * available?" in order to enable a control, and it must be able to do that
 * without pulling in the backend. The `./webgpu` entry point re-lowers user code
 * to HIR, which bundles the TypeScript compiler and its Node builtins — importing
 * that from an editor component breaks the browser build outright.
 *
 * Keep this module free of imports.
 */

/**
 * Host globals, reached structurally.
 *
 * The package is headless by design and pins `types: []` plus `lib: ["ESNext"]`,
 * so `navigator` is not a declared global here (see `../environment.ts`).
 */
const host = globalThis as unknown as {
  navigator?: { gpu?: unknown };
};

/**
 * Whether this environment exposes the WebGPU API.
 *
 * Only checks for the API's presence — an adapter can still be unavailable even
 * where `navigator.gpu` exists, which `requestGpuDevice` reports separately.
 */
export function isWebGpuAvailable(): boolean {
  return host.navigator?.gpu !== undefined;
}
