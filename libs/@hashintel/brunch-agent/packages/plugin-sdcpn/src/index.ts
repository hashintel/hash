/**
 * `@hashintel/brunch-agent-plugin-sdcpn` — the operational-process domain
 * typology paired with the SDCPN target formalism.
 *
 * The plugin is a contribution bundle: `prompts/` for always-on policy,
 * `skills/sdcpn-modelling/` for the job skill and its resources, `tools/` for
 * executable Petrinaut capabilities, and `flue.ts` for the selected mounting.
 * The retired YAML definition and typed slot-assertion proposal path were
 * removed on 2026-09-02. The `./flue` subpath owns the production contribution;
 * the root also exposes host-consumed transition verification.
 */

export {
  assertMutationEffects,
  canonicalContent,
  classifyMutationOutcome,
  clientToolResultMetadataSchema,
  deriveLayoutEffects,
  deriveMutationEffects,
  expectedNodeDefinition,
  isConstructionMutationName,
  observedMutationOutcome,
  type ClassifiedMutationOutcome,
  parseClientToolResultMetadata,
  reconcileMutationAttempts,
  verifyMutationAttempt,
  verifyCanonicalMutationRecord,
  verifyExperimentRecord,
  verifyDeepConstructionRecord,
  verifyDefinitionObservation,
  reconcileDefinitionObservations,
  type MutationEffects,
  type ExperimentRecord,
  type VerifiedExperimentRecord,
  type CanonicalMutationRecord,
  type VerifiedCanonicalMutationRecord,
  type DeepConstructionRecord,
  type VerifiedDeepConstructionRecord,
  type VerifiedDeepConstructionStep,
  type VerifiedDeepLayoutRecord,
  type ArcMutationRequest,
  type BrowserBinding,
  type ClientToolResultMetadata,
  type ConstructionMutationName,
  type ObservedConstructionMutationName,
  type ConstructionMutationRequest,
  type ConstructionMutationAttempt,
  type ConstructionMutationRecord,
  type ArcMutationAttempt,
  type ArcMutationRecord,
  type DefinitionObservation,
  type UnverifiedDefinitionObservation,
} from "./mutation-record";

export {
  observedArcMutationNames,
  browserBindingSchema,
  rootArcWhyInputSchema,
  locateRootArc,
  type ObservedArcMutationName,
  type RootArcWhyInput,
} from "./root-arc";
export { CANONICAL_PETRINAUT_TOOLS_MODE } from "./construction-mode";
export {
  isLayoutPetrinautNetToolName,
  isReadPetrinautDocsToolName,
  isReadPetrinautDiagnosticsToolName,
  isReadPetrinautNetToolName,
  layoutPetrinautNetToolName,
  READ_PETRINAUT_DOCS_TOOL_NAME,
  readPetrinautDiagnosticsToolName,
  readPetrinautNetToolName,
} from "./construction-tool-names";
export {
  APPLY_PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  applyPetrinautConstructionInputSchema,
  applyPetrinautConstructionOutputSchema,
  applyPetrinautConstructionToolName,
  batchedConstructionMode,
  isMutatePetrinautNetToolName,
  mutatePetrinetAttemptCallId,
  mutatePetrinetAttemptOperationId,
  mutatePetrinetInputSchema,
  mutatePetrinetOutputSchema,
  mutatePetrinautNetToolName,
  type ApplyPetrinautConstructionInput,
  type ApplyPetrinautConstructionOutput,
  type MutatePetrinetInput,
  type MutatePetrinetOperation,
  type MutatePetrinetOutput,
} from "./mutate-petrinet";
export {
  createDeclarePetrinautProjectionTool,
  declarePetrinautProjectionToolName,
  declaredProjectionInputSchema,
  declaredProjectionOutputSchema,
  validateDeclaredBasis,
  verifyDeclaredProjectionOutput,
  type DeclaredBasis,
  type DeclaredProjectionInput,
  type DeclaredProjectionOutput,
} from "./declared-basis";
export {
  draftPetrinautExperimentInputSchema,
  draftPetrinautExperimentOutputSchema,
  draftPetrinautExperimentToolName,
  isDraftPetrinautExperimentToolName,
  type DraftPetrinautExperimentInput,
  type DraftPetrinautExperimentOutput,
} from "./draft-experiment";
export {
  constructionWhyInputSchema,
  queryWorkpieceInputSchema,
  parseConstructionWhyInput,
  rootNodeWhyInputSchema,
  type RootNodeWhyInput,
  observedNodeMutationNames,
  isObservedNodeMutation,
  locateRootNode,
  assertNodeIdentity,
  type ObservedNodeMutationName,
} from "./root-node";

export {
  observedStateMutationNames,
  isObservedStateMutation,
  assertStateIdentity,
  rootStateWhyInputSchema,
  locateRootState,
  type ObservedStateMutationName,
  type RootStateWhyInput,
} from "./root-state";

export const SDCPN_DOMAIN_TYPOLOGY = "operational processes";
export const SDCPN_TARGET_FORMALISM = "sdcpn";
