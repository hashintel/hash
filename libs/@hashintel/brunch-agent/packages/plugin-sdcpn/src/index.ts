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
  assertArcEffects,
  canonicalContent,
  classifyTransitionOutcome,
  clientToolResultMetadataSchema,
  deriveArcEffects,
  expectedNodeDefinition,
  observedArcOutcome,
  type ClassifiedTransitionOutcome,
  parseClientToolResultMetadata,
  reconcileArcTransitionAttempts,
  verifyArcTransitionAttempt,
  verifyDefinitionObservation,
  reconcileDefinitionObservations,
  type ArcEffects,
  type ArcMutationRequest,
  type BrowserBinding,
  type ClientToolResultMetadata,
  type ConstructionMutationName,
  type ConstructionMutationRequest,
  type ConstructionTransitionAttempt,
  type ConstructionTransitionRecord,
  type ArcTransitionAttempt,
  type ArcTransitionRecord,
  type DefinitionObservation,
  type UnverifiedDefinitionObservation,
} from "./transition-record";

export {
  conversationConstructionMode,
  joinedRootArcInputSchema,
  observedArcInputSchema,
  observedArcMutationNames,
  isObservedArcMutation,
  parseObservedArcInput,
  parseJoinedRootArcInput,
  browserBindingSchema,
  rootArcEnvelopeSchema,
  rootArcWhyInputSchema,
  locateRootArc,
  type ObservedArcMutationName,
  type RootArcWhyInput,
} from "./root-arc";
export { observedConstructionBrowserToolNames } from "./construction-tool-names";
export {
  batchedConstructionMode,
  mutatePetrinetInputSchema,
  mutatePetrinetToolName,
} from "./mutate-petrinet";
export { validateDeclaredBasis, type DeclaredBasis } from "./declared-basis";
export {
  constructionWhyInputSchema,
  parseConstructionWhyInput,
  rootNodeWhyInputSchema,
  type RootNodeWhyInput,
  observedNodeMutationNames,
  isObservedNodeMutation,
  observedNodeInputSchema,
  parseObservedNodeInput,
  locateRootNode,
  assertNodeIdentity,
  type ObservedNodeMutationName,
} from "./root-node";

export {
  observedStateMutationNames,
  isObservedStateMutation,
  observedStateInputSchema,
  parseObservedStateInput,
  assertStateIdentity,
  rootStateWhyInputSchema,
  locateRootState,
  type ObservedStateMutationName,
  type RootStateWhyInput,
} from "./root-state";

export const SDCPN_DOMAIN_TYPOLOGY = "operational processes";
export const SDCPN_TARGET_FORMALISM = "sdcpn";
