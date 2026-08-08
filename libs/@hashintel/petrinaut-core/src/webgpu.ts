/**
 * WebGPU compute backend for Monte Carlo experiments (experimental).
 *
 * A separate entry point, not part of the main bundle, because it depends on the
 * HIR frontend to re-lower user code and because it is opt-in: the CPU path
 * remains the default and the only one that runs every net.
 *
 * See `../docs/simulation-performance.md` §8 for why this shape (whole-experiment
 * dispatch, on-GPU metric reduction) is the only GPU design that is faster than
 * the CPU rather than slower.
 */
export {
  createWebGpuExperimentBackend,
  WEBGPU_BACKEND_ID,
  type WebGpuExperimentBackendOptions,
} from "./webgpu/webgpu-experiment-backend";

export {
  GPU_HISTOGRAM_BINS,
  GPU_WORKGROUP_SIZE,
  compileNetShader,
} from "./webgpu/compile-net-shader";
export type {
  CompileNetShaderInput,
  CompileNetShaderResult,
  CompiledNetShader,
  GpuMetricSpec,
  GpuOdeMethod,
} from "./webgpu/compile-net-shader";
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
export {
  assessGpuEligibility,
  formatGpuIneligibility,
} from "./webgpu/eligibility";
export type {
  GpuEligibility,
  GpuIneligibilityReason,
  GpuNetProfile,
} from "./webgpu/eligibility";
export {
  describeMathFnSupport,
  emitF32Literal,
  isWgslRepresentableType,
  WgslBailError,
  WgslEmitter,
} from "./webgpu/emit-wgsl";
export type { WgslEmitterOptions, WgslValue } from "./webgpu/emit-wgsl";
export { createGpuMonteCarloExperiment } from "./webgpu/gpu-experiment-handle";
export type {
  CreateGpuMonteCarloExperimentConfig,
  CreateGpuMonteCarloExperimentResult,
} from "./webgpu/gpu-experiment-handle";
export { runGpuMonteCarloExperiment } from "./webgpu/gpu-experiment";
export {
  toGpuMetricFrames,
  toGpuMetricSpecs,
} from "./webgpu/gpu-metric-frames";
export type {
  GpuExperimentConfig,
  GpuExperimentOutcome,
} from "./webgpu/gpu-experiment";
export { hirFromArtifacts } from "./webgpu/hir-from-artifacts";
export type { NetHir } from "./webgpu/hir-from-artifacts";
export {
  DEFAULT_GPU_FRAMES_PER_DISPATCH,
  requestGpuExperimentBackend,
} from "./webgpu/backend";
export type {
  GpuBackend,
  GpuBackendRequest,
  GpuBackendUnavailable,
} from "./webgpu/backend";
export {
  deriveGpuRunSeed,
  requestGpuDevice,
  runGpuExperiment,
} from "./webgpu/runner";
export { isWebGpuAvailable } from "./webgpu/support";
export { tryTranslateKernel } from "./webgpu/try-translate-kernel";
export type { KernelTranslationResult } from "./webgpu/try-translate-kernel";
export type {
  GpuDeviceHandle,
  GpuExperimentRequest,
  GpuExperimentResult,
  GpuHistogramFrame,
} from "./webgpu/runner";
export {
  isReservedWgslIdentifier,
  mangleWgslIdentifier,
} from "./webgpu/wgsl-identifiers";
export { wgslPrelude } from "./webgpu/wgsl-prelude";
