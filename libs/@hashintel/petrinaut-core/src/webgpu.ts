/**
 * WebGPU compute backend for Monte Carlo experiments (experimental).
 *
 * A separate entry point, not part of the main bundle, because it carries the
 * whole shader generator and because it is opt-in: the CPU path remains the
 * default and the only one that runs every net. User-code HIR arrives inside
 * the compiled artifacts (`webgpu/hir-from-artifacts.ts`), so nothing here
 * touches the TypeScript frontend.
 *
 * Only the surface the app consumes is exported: the backend factory, the
 * compilation report the editor renders, and the metric-spec gate the
 * experiment drawer applies. Everything else in `webgpu/` is internal; tests
 * import it by relative path.
 *
 * See `libs/@local/petrinaut-arch-docs/content/simulation/performance.mdx` §8
 * for why this shape (whole-experiment dispatch, on-GPU metric reduction) is
 * the only GPU design that is faster than the CPU rather than slower.
 */
export {
  createWebGpuExperimentBackend,
  WEBGPU_BACKEND_ID,
  type WebGpuExperimentBackendOptions,
} from "./webgpu/webgpu-experiment-backend";

export {
  analyzeCompilation,
  summarizeGpuUnavailability,
} from "./webgpu/compilation-report";
export type {
  AnalyzeCompilationInput,
  CompilationItemKind,
  CompilationItemReport,
  CompilationItemStatus,
  CompilationReport,
} from "./webgpu/compilation-report";

export { toGpuMetricSpecs } from "./webgpu/gpu-metric-frames";
export type { GpuMetricSpec } from "./webgpu/compile-net-shader";
