import { createHash } from "node:crypto";

import {
  defineTool,
  useInitialData,
  useInstruction,
  useSkill,
  useTool,
} from "@flue/runtime";
import * as v from "valibot";

import { petrinautAiCapabilityGuidance } from "@hashintel/petrinaut-core/ai";

import {
  BRUNCH_DECLARED_PROJECTION_MODE,
  BRUNCH_DEEP_CONSTRUCTION_MODE,
  INTEGRATED_PETRINAUT_MODES,
  STOCK_OVER_FLUE_MODE,
  isIntegratedPetrinautMode,
} from "./construction-mode";
import {
  READ_PETRINAUT_DOCS_TOOL_NAME,
  isReadPetrinautDocsToolName,
  readPetrinautDiagnosticsToolName,
  readPetrinautNetToolName,
} from "./construction-tool-names";
import {
  declarePetrinautProjectionToolName,
  declaredProjectionInputSchema,
  declaredProjectionOutputSchema,
  resolveDeclaredProjectionOutput,
} from "./declared-basis";
import { draftPetrinautExperimentToolName } from "./draft-experiment";
import { batchedConstructionMode } from "./mutate-petrinet";
import sdcpnAppend from "./prompts/APPEND_SYSTEM.md?raw";
import { browserBindingSchema } from "./root-arc";
import {
  SDCPN_MODELLING_SKILL_NAME,
  sdcpnModellingSkill,
} from "./skills/sdcpn-modelling/skill";
import { createDraftExperimentTool } from "./tools/draft-experiment";
import {
  applyPetrinautConstructionTool,
  createMutatePetrinetTool,
} from "./tools/mutate-petrinet";
import {
  observedDefinitionReadTool,
  observedCompilationReadTool,
  observedLayoutCommandTool,
  canonicalPetrinautTools,
  petrinautConstructionTools,
  type ObservedConstructionOptions,
  type WorkpieceAuthorityOptions,
} from "./tools/petrinaut-construction";
import { readPetrinautDocs } from "./tools/read-petrinaut-doc";

export const VALIDATED_CONSTRUCTION_MODE = "validated-construction";
export {
  BRUNCH_DECLARED_PROJECTION_MODE,
  BRUNCH_DEEP_CONSTRUCTION_MODE,
  CANONICAL_PETRINAUT_TOOLS_MODE,
  INTEGRATED_BRUNCH_MODE,
  STOCK_OVER_FLUE_MODE,
  isIntegratedPetrinautMode,
  type CanonicalPetrinautMode,
  type IntegratedPetrinautMode,
} from "./construction-mode";
export {
  applyPetrinautConstructionToolName,
  batchedConstructionMode,
  mutatePetrinautNetToolName,
} from "./mutate-petrinet";

export const sdcpnInitialDataSchema = v.optional(
  v.pipe(
    v.object({
      mode: v.picklist([
        VALIDATED_CONSTRUCTION_MODE,
        STOCK_OVER_FLUE_MODE,
        ...INTEGRATED_PETRINAUT_MODES,
        batchedConstructionMode,
      ]),
      construction: v.optional(
        v.strictObject({ binding: browserBindingSchema }),
      ),
    }),
    v.check(
      (data) =>
        data.mode === batchedConstructionMode ||
        data.mode === STOCK_OVER_FLUE_MODE ||
        isIntegratedPetrinautMode(data.mode)
          ? data.construction !== undefined
          : data.construction === undefined,
      "Construction requires a distinct immutable binding and mode.",
    ),
  ),
);

export type SdcpnInitialData = v.InferOutput<typeof sdcpnInitialDataSchema>;

type SdcpnInitialDataFields = NonNullable<SdcpnInitialData>;

/** The browser the agent is bound to: its immutable conversation binding. */
export type BrowserContext = NonNullable<
  SdcpnInitialDataFields["construction"]
>;

const createDeclarePetrinautProjectionTool = (
  currentRevision: WorkpieceAuthorityOptions["currentRevision"],
) =>
  defineTool({
    name: declarePetrinautProjectionToolName,
    description:
      "Declare one bounded intended Petrinaut projection before direct canonical mutation calls. The host binds it to the current settled Ledger and resolves any exact excerpts. This records intent only: it neither executes operations nor reports their effects.",
    input: declaredProjectionInputSchema,
    output: declaredProjectionOutputSchema,
    run({ data }) {
      if (!currentRevision)
        throw new Error(
          "Settle a current Ledger revision before declaring a projection.",
        );
      if (
        createHash("sha256")
          .update(currentRevision.markdown, "utf8")
          .digest("hex") !== currentRevision.sha256
      )
        throw new Error(
          "Current Ledger revision hash does not match its content.",
        );
      return {
        output: resolveDeclaredProjectionOutput(data, currentRevision),
        terminate: false,
      };
    },
  });

/** Mount the prompt material, skill, and conditional tools owned by the SDCPN plugin. */
export function useSdcpnPlugin(
  options?: WorkpieceAuthorityOptions &
    Partial<Pick<ObservedConstructionOptions, "observationFor">> &
    Partial<
      Pick<Parameters<typeof createDraftExperimentTool>[0], "authorizeDraft">
    >,
): void {
  const initialData = useInitialData<SdcpnInitialData>();

  if (initialData?.mode === STOCK_OVER_FLUE_MODE) {
    for (const canonicalTool of canonicalPetrinautTools) {
      useTool(canonicalTool);
    }
  } else if (isIntegratedPetrinautMode(initialData?.mode)) {
    useInstruction(sdcpnAppend.trim());
    useInstruction(petrinautAiCapabilityGuidance);
    useSkill(sdcpnModellingSkill);
    if (!options?.authorizeDraft)
      throw new Error(
        "Integrated Brunch requires draft history authorization.",
      );
    useTool(
      createDraftExperimentTool({
        ...options,
        authorizeDraft: options.authorizeDraft,
      }),
    );
    useInstruction(
      "For Ledger-derived experiment proposals, prefer draft_petrinaut_experiment after a verified canonical getLatestNetDefinition read. Only call canonical createExperiment directly when the person explicitly requests immediate execution. Draft preparation is not execution; Run and Dismiss are editor-local human actions.",
    );
    if (initialData.mode === BRUNCH_DECLARED_PROJECTION_MODE) {
      useInstruction(
        "Before bounded direct addPlace, addTransition, or addArc construction, call declare_petrinaut_projection in its own server-tool proposal and wait for its result. Then issue the matching canonical browser calls in declaration order. Use other canonical tools directly for reads, documentation, experiments, layout, and capabilities outside this bounded tracer.",
      );
      useTool(createDeclarePetrinautProjectionTool(options.currentRevision));
    }
    for (const canonicalTool of canonicalPetrinautTools) {
      useTool(canonicalTool);
    }
    if (initialData.mode === BRUNCH_DEEP_CONSTRUCTION_MODE) {
      useInstruction(
        "For a bounded connected fragment of up to three addPlace, addTransition, and addArc operations, use apply_petrinaut_construction instead of orchestrating those sibling mutation calls directly. Use canonical tools directly for reads, documentation, experiments, interactive layout, capabilities outside that bounded carrier, and later fine-grained corrections.",
      );
      useTool(applyPetrinautConstructionTool);
    }
  } else {
    useInstruction(sdcpnAppend.trim());
    useSkill(sdcpnModellingSkill);
    useTool(readPetrinautDocs);
  }

  if (initialData?.mode === batchedConstructionMode) {
    if (!initialData.construction || !options?.observationFor)
      throw new Error("Batched construction requires authorized observations.");
    useInstruction(
      "Construction uses strictly separate proposals. Proposal 1 contains only required skill-resource reads and other server tools; wait for every result. Proposal 2 contains only read_petrinaut_net; wait for its browser result. Proposal 3 contains only mutate_petrinaut_net; wait for its browser result. After a batch that writes code or changes a dependency of code, obtain read_petrinaut_diagnostics in its own proposal and wait for the browser result. A structurally applied mutation is not compiler-clean; pending or missing diagnostics are not clean. Use one bounded ordered construction chunk and do not call individual mutation tools. Cite the exact observation tool-call ID and base hash. Deduplicate settled bases, assign each a basisId, and put a mandatory basisId on every operation as a sibling of operationId, type and input. Give every operation a unique operationId. mutate_petrinaut_net carries root-net operations only: adds (addPlace, addTransition, addArc, addType, addTypeElement, addParameter, addDifferentialEquation), edits to existing parts by ID (updatePlace, updateTransition, updateArcWeight, updateArcType, updateType, updateTypeElement, updateParameter, updateDifferentialEquation) and removals (removePlace, removeTransition, removeArc, removeType, removeTypeElement, removeParameter, removeDifferentialEquation). Correct an existing part by editing it; do not remove and re-add it. removePlace also removes connected arcs; removing a type, element, parameter or equation that code still reads leaves that code dirty until repaired. Canvas positions are not operations; layout owns them. A read_petrinaut_diagnostics result that reports diagnostics as still pending is not a result: repeat the read before any compiler claim. Operations commit in order; failure leaves the later suffix unattempted. After a batch that added or restructured places or transitions, and once diagnostics are settled, call layout_petrinaut_net in its own proposal; pass askUserFirst false only when this conversation built the net from an empty canvas, otherwise true so the user can decline. Do not lay out after a batch that only changed types, parameters or dynamics. Layout is recorded separately with its own pre and post hash; the post hash is the base for any later observation.",
    );
    useTool(observedDefinitionReadTool);
    useTool(observedCompilationReadTool);
    useTool(observedLayoutCommandTool);
    useTool(
      createMutatePetrinetTool({
        ...options,
        observationFor: options.observationFor,
      }),
    );
  } else if (initialData?.mode === VALIDATED_CONSTRUCTION_MODE) {
    useInstruction(
      `
This is a construct-only headless conversation. Use only the supplied runbook IR as modelling input, do not interview, and build the net through the mounted Petrinaut tools instead of emitting net JSON.
`.replace(/^\s+|\s+$/gu, ""),
    );
    for (const constructionTool of petrinautConstructionTools) {
      useTool(constructionTool);
    }
  }
}

export {
  isReadPetrinautDocsToolName,
  READ_PETRINAUT_DOCS_TOOL_NAME,
  readPetrinautDiagnosticsToolName,
  readPetrinautDocs,
  readPetrinautNetToolName,
};
export {
  createDeclarePetrinautProjectionTool,
  declarePetrinautProjectionToolName,
  draftPetrinautExperimentToolName,
  SDCPN_MODELLING_SKILL_NAME,
};
export {
  CANONICAL_PETRINAUT_TOOL_NAMES,
  canonicalPetrinautTools,
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  layoutPetrinautNetToolName,
  petrinautConstructionTools,
  type PetrinautConstructionToolName,
} from "./tools/petrinaut-construction";
