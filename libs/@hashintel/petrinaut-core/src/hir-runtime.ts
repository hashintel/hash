/**
 * Runtime-only entry point for HIR-compiled artifacts.
 *
 * The simulation workers import from here — it instantiates precompiled
 * buffer-program sources without pulling the TS→HIR compiler (and its
 * `typescript` dependency) into worker bundles. The full pipeline lives in
 * `./hir.ts`.
 */
export {
  hirDistributionRuntime,
  instantiateHirBufferDynamics,
  instantiateHirBufferKernel,
  instantiateHirBufferLambda,
  type HirArtifacts,
  type HirCompiledBufferDynamics,
  type HirCompiledBufferKernel,
  type HirCompiledBufferLambda,
  type HirDynamicsArtifact,
  type HirKernelArtifact,
  type HirKernelSink,
  type HirLambdaArtifact,
  type HirParameterValues,
  type HirStringPool,
} from "./hir/instantiate";
