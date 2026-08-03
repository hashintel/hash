// Node/tooling-only model compilation entry. Keep this separate from the main
// browser-facing entry because compiling HIR requires the TypeScript compiler.
export {
  compileScenarioProgram,
  type CompiledScenarioProgram,
  type CompileScenarioProgramOutcome,
} from "./simulation/authoring/scenario/compile-scenario-program";
export { compilePetrinautModel } from "./simulation/compiled-model";
export type {
  CompilePetrinautModelConfig,
  PetrinautCompiledModel,
  PetrinautCompiledModelMetadata,
  PetrinautCompiledModelMetricMetadata,
  PetrinautCompiledModelParameterMetadata,
  PetrinautCompiledModelPlaceMetadata,
  PetrinautRunCompletionReason,
  PetrinautRunConfig,
  PetrinautRunResult,
} from "./simulation/compiled-model";
