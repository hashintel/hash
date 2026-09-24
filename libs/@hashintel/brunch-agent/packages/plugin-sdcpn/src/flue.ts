import {
  useInitialData,
  useInstruction,
  useSkill,
  useTool,
} from "@flue/runtime";
import * as v from "valibot";

import {
  READ_PETRINAUT_DOCS_TOOL_NAME,
  isReadPetrinautDocsToolName,
  readPetrinautDiagnosticsToolName,
  readPetrinautNetToolName,
} from "./construction-tool-names";
import {
  draftPetrinautExperimentToolName,
  isDraftPetrinautExperimentToolName,
} from "./draft-experiment";
import { batchedConstructionMode } from "./mutate-petrinet";
import sdcpnAppend from "./prompts/APPEND_SYSTEM.md?raw";
import { browserBindingSchema } from "./root-arc";
import {
  SDCPN_MODELLING_SKILL_NAME,
  sdcpnModellingSkill,
} from "./skills/sdcpn-modelling/skill";
import { createDraftExperimentTool } from "./tools/draft-experiment";
import { createMutatePetrinetTool } from "./tools/mutate-petrinet";
import {
  observedDefinitionReadTool,
  observedCompilationReadTool,
  observedLayoutCommandTool,
  petrinautConstructionTools,
  type ObservedConstructionOptions,
  type WorkpieceAuthorityOptions,
} from "./tools/petrinaut-construction";
import { readPetrinautDocs } from "./tools/read-petrinaut-doc";

export const VALIDATED_CONSTRUCTION_MODE = "validated-construction";
export {
  batchedConstructionMode,
  mutatePetrinautNetToolName,
} from "./mutate-petrinet";

export const sdcpnInitialDataSchema = v.optional(
  v.pipe(
    v.object({
      mode: v.picklist([VALIDATED_CONSTRUCTION_MODE, batchedConstructionMode]),
      construction: v.optional(
        v.strictObject({ binding: browserBindingSchema }),
      ),
    }),
    v.check(
      (data) =>
        data.mode === batchedConstructionMode
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

/** Mount the prompt material, skill, and conditional tools owned by the SDCPN plugin. */
export function useSdcpnPlugin(
  options?: WorkpieceAuthorityOptions &
    Partial<Pick<ObservedConstructionOptions, "observationFor">>,
): void {
  const initialData = useInitialData<SdcpnInitialData>();

  useInstruction(sdcpnAppend.trim());
  useSkill(sdcpnModellingSkill);
  useTool(readPetrinautDocs);

  if (initialData?.mode === batchedConstructionMode) {
    if (!initialData.construction || !options?.observationFor)
      throw new Error("Batched construction requires authorized observations.");
    useInstruction(
      "Construction uses strictly separate proposals. Proposal 1 contains only required skill-resource reads and other server tools; wait for every result. Proposal 2 contains only read_petrinaut_net; wait for its browser result. Proposal 3 contains only mutate_petrinaut_net; wait for its browser result. After a batch that writes code or changes a dependency of code, obtain read_petrinaut_diagnostics in its own proposal and wait for the browser result. A structurally applied mutation is not compiler-clean; pending or missing diagnostics are not clean. Use one bounded ordered construction chunk and do not call individual mutation tools. Cite the exact observation tool-call ID and base hash. Deduplicate settled bases, assign each a basisId, and put a mandatory basisId on every operation as a sibling of operationId, type and input. Give every operation a unique operationId. mutate_petrinaut_net carries root-net operations only: adds (addPlace, addTransition, addArc, addType, addTypeElement, addParameter, addDifferentialEquation), edits to existing parts by ID (updatePlace, updateTransition, updateArcWeight, updateArcType, updateType, updateTypeElement, updateParameter, updateDifferentialEquation) and removals (removePlace, removeTransition, removeArc, removeType, removeTypeElement, removeParameter, removeDifferentialEquation), and the saved scenarios and metrics a run or experiment names (addScenario, updateScenario, removeScenario, addMetric, updateMetric, removeMetric); a scenario's initialState is per_place and each scenario parameter carries its type. Correct an existing part by editing it; do not remove and re-add it. removePlace also removes connected arcs; removing a type, element, parameter or equation that code still reads leaves that code dirty until repaired. Canvas positions are not operations; layout owns them. A read_petrinaut_diagnostics result that reports diagnostics as still pending is not a result: repeat the read before any compiler claim. Operations commit in order; failure leaves the later suffix unattempted. After a batch that added or restructured places or transitions, and once diagnostics are settled, call layout_petrinaut_net in its own proposal; pass askUserFirst false only when this conversation built the net from an empty canvas, otherwise true so the user can decline. Do not lay out after a batch that only changed types, parameters or dynamics. Layout is recorded separately with its own pre and post hash; the post hash is the base for any later observation. draft_petrinaut_experiment is a separate proposal of its own, called only after the skill's experiment-configuration reference judges the settled workpiece and the current net ready; it cites the same observation shape and a declared basis, drafts for this session without running, and is never a substitute for construction or a way to run.",
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
    useTool(
      createDraftExperimentTool({
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
  draftPetrinautExperimentToolName,
  isDraftPetrinautExperimentToolName,
  isReadPetrinautDocsToolName,
  READ_PETRINAUT_DOCS_TOOL_NAME,
  readPetrinautDiagnosticsToolName,
  readPetrinautDocs,
  readPetrinautNetToolName,
};
export { SDCPN_MODELLING_SKILL_NAME };
export {
  PETRINAUT_CONSTRUCTION_TOOL_NAMES,
  layoutPetrinautNetToolName,
  petrinautConstructionTools,
  type PetrinautConstructionToolName,
} from "./tools/petrinaut-construction";
