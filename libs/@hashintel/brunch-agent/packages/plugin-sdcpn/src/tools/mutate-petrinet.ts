import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";

import { validateDeclaredBasis } from "../declared-basis";
import {
  applyPetrinautConstructionInputSchema,
  applyPetrinautConstructionToolName,
  mutatePetrinetInputSchema,
  mutatePetrinautNetToolName,
} from "../mutate-petrinet";

import type { ObservedConstructionOptions } from "./petrinaut-construction";

/** Interface B is executed entirely by the bound browser host. */
export const applyPetrinautConstructionTool = defineTool({
  name: applyPetrinautConstructionToolName,
  description:
    "Apply one bounded construction of one to three canonical Petrinaut operations in dependency order (addPlace, then addTransition, then addArc). Each operation carries model-authored intent and expected impact, with optional literal Ledger excerpts; the browser host resolves current Ledger attribution and document authority, executes the successful prefix, settles, diagnoses relevant changes, and performs explicitly requested relevant layout. Do not copy hashes, revisions, observation identities, locators, bindings, or other protocol bookkeeping. This is a browser call: submit it separately from server tools. Canonical tools remain available for reads, documentation, experiments, interactive layout, and direct corrections.",
  input: applyPetrinautConstructionInputSchema,
  output: v.object({ awaiting: v.literal(AWAITING_CLIENT) }),
  run() {
    return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
  },
});

export const createMutatePetrinetTool = (
  options: ObservedConstructionOptions,
) =>
  defineTool({
    name: mutatePetrinautNetToolName,
    description:
      "Apply one ordered batch of operations that add (addPlace, addTransition, addArc, addType, addTypeElement, addParameter, addDifferentialEquation), remove (removePlace, removeTransition, removeArc, removeType, removeTypeElement, removeParameter, removeDifferentialEquation) or edit existing parts of the net (updatePlace, updateTransition, updateArcWeight, updateArcType, updateType, updateTypeElement, updateParameter, updateDifferentialEquation), and save, edit or remove the scenarios and metrics a run or experiment names (addScenario, updateScenario, removeScenario, addMetric, updateMetric, removeMetric). A scenario carries a per_place initialState keyed by place ID and typed scenarioParameters read as scenario.<identifier>; a count is an integer parameter. Metric code reads the simulated state. To correct something that already exists, edit it by ID with only the fields that change; do not remove and re-add it. removePlace also removes arcs connected to that place; removeType and removeDifferentialEquation clear the places that referenced them, so code that read those tokens or parameters will need repair. Each operation is a flat {operationId, basisId, type, input} object. Every operation must cite one deduplicated declared basis via basisId and the exact preceding browser observation/base. A structurally applied batch is not compiler-clean; after a batch that writes code or changes a dependency of code, obtain read_petrinaut_diagnostics before relying on the result. Operations commit in order; failure stops and leaves later operations unattempted, so place addType, addParameter and addDifferentialEquation before the places and transitions that reference them, and addPlace/addTransition before the arcs that connect them.",
    input: mutatePetrinetInputSchema,
    output: v.object({ awaiting: v.literal(AWAITING_CLIENT) }),
    async run({ data }) {
      if (!options.currentRevision)
        throw new Error("Settle the workpiece before construction.");
      await Promise.all(
        data.bases.map(({ basis }) =>
          validateDeclaredBasis(
            basis,
            options.currentRevision,
            options.retainedRevisionFor,
          ),
        ),
      );
      const observation = await options.observationFor(
        data.observation.toolCallId,
      );
      if (observation.sha256 !== data.observation.baseHash)
        throw new Error(
          "Mutation batch base differs from the verified browser observation.",
        );
      return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
    },
  });
