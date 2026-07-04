/**
 * Runtime-only entry point for HIR-compiled artifacts.
 *
 * The simulation engine and its workers import from here — it instantiates
 * precompiled artifact sources without pulling the TS→HIR compiler (and its
 * `typescript` dependency) into worker bundles. The full pipeline (lowering,
 * analyses, linting, artifact compilation) lives in `./hir.ts`.
 */
export {
  hirDistributionRuntime,
  instantiateHirBufferDynamics,
  instantiateHirBufferKernel,
  instantiateHirBufferLambda,
  instantiateHirUserFn,
  type HirArtifacts,
  type HirCompiledBufferDynamics,
  type HirCompiledBufferKernel,
  type HirCompiledBufferLambda,
  type HirCompiledUserFn,
  type HirDynamicsArtifact,
  type HirKernelArtifact,
  type HirLambdaArtifact,
  type HirParameterValues,
} from "./hir/instantiate";
