/**
 * Public entry point for the Petrinaut HIR (high-level intermediate
 * representation) — see `hir/README.md` for the design document.
 *
 * The HIR pipeline: TypeScript user code → `lowerTypeScriptToHir` →
 * analyses (`typecheckHir`, `analyzeHir`) / linting (`lintHirUserCode`) /
 * compilation (`emit-js` via `tryCompileHir*`).
 */
export { fingerprintHirCompilationInput } from "./hir/artifact-fingerprint";
export {
  analyzeHir,
  foldHir,
  type DistributionDag,
  type DistributionDagEdge,
  type DistributionDagNode,
  type DistributionSink,
  type HirAnalysis,
  type HirBindingInfo,
  type HirDependencies,
  type HirTokenRead,
} from "./hir/analyze";
export {
  compileHirArtifacts,
  type HirCompileFailure,
  type HirCompileResult,
} from "./hir/compile";
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
export {
  emitBufferDynamicsJs,
  emitBufferKernelJs,
  emitBufferLambdaJs,
  emitBufferMetricJs,
  type BufferKernelProgram,
  type BufferMetricProgram,
  type BufferProgram,
} from "./hir/emit-buffer-js";
export { emitUserFunctionJs } from "./hir/emit-js";
export {
  formatHirType,
  hirChildren,
  walkHir,
  type HirDiagnostic,
  type HirDiagnosticSeverity,
  type HirExpr,
  type HirFunction,
  type HirNodeId,
  type HirSurfaceKind,
  type HirType,
  type Span,
} from "./hir/hir";
export {
  lintHirUserCode,
  type HirLintOptions,
  type HirLintResult,
} from "./hir/lint";
export {
  lowerTypeScriptToHir,
  type LowerTypeScriptResult,
} from "./hir/lower-typescript";
export {
  buildDynamicsContext,
  buildKernelContext,
  buildLambdaContext,
  buildMetricContext,
  type HirDynamicsContext,
  type HirKernelContext,
  type HirLambdaContext,
  type HirMetricContext,
  type HirMetricPlaceInfo,
  type HirParameterInfo,
  type HirPlaceBinding,
  type HirSurfaceContext,
  type HirTokenElementInfo,
} from "./hir/surface-context";
export { typecheckHir, type HirTypecheckResult } from "./hir/typecheck";
