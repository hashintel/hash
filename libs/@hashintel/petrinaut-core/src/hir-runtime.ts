/**
 * Runtime-only entry point for HIR-compiled artifacts.
 *
 * The simulation workers import from here — it instantiates precompiled
 * buffer-program sources without pulling the TS→HIR compiler (and its
 * `typescript` dependency) into worker bundles. The full pipeline lives in
 * `./hir.ts`.
 */
export { fingerprintHirCompilationInput } from "./hir/artifact-fingerprint";
export {
  hirDistributionRuntime,
  instantiateHirBufferDynamics,
  instantiateHirBufferKernel,
  instantiateHirBufferLambda,
  instantiateHirMetric,
  type HirArtifacts,
  type HirCompiledBufferDynamics,
  type HirCompiledBufferKernel,
  type HirCompiledBufferLambda,
  type HirCompiledMetric,
  type HirDynamicsArtifact,
  type HirKernelArtifact,
  type HirKernelSink,
  type HirLambdaArtifact,
  type HirMetricArtifact,
  type HirParameterValues,
  type HirStringPool,
  type HirStringPoolReader,
} from "./hir/instantiate";
