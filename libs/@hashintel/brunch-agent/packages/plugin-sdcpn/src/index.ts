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
  deriveArcEffects,
  observedArcOutcome,
  reconcileArcTransitionAttempts,
  verifyArcTransitionAttempt,
  type ArcEffects,
  type ArcMutationRequest,
  type ArcTransitionAttempt,
  type ArcTransitionRecord,
  type DefinitionObservation,
} from "./transition-record";

export {
  joinedRootArcInputSchema,
  parseJoinedRootArcInput,
  browserBindingSchema,
  rootArcEnvelopeSchema,
} from "./root-arc";
export { validateDeclaredBasis, type DeclaredBasis } from "./declared-basis";

export const SDCPN_DOMAIN_TYPOLOGY = "operational processes";
export const SDCPN_TARGET_FORMALISM = "sdcpn";
