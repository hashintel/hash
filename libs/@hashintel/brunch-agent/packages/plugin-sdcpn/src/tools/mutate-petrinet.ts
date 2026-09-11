import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";

import { validateDeclaredBasis } from "../declared-basis";
import {
  mutatePetrinetInputSchema,
  mutatePetrinautNetToolName,
} from "../mutate-petrinet";

import type { ObservedConstructionOptions } from "./petrinaut-construction";

export const createMutatePetrinetTool = (
  options: ObservedConstructionOptions,
) =>
  defineTool({
    name: mutatePetrinautNetToolName,
    description:
      "Apply one ordered batch of operations that add (addPlace, addTransition, addArc, addType, addTypeElement, addParameter, addDifferentialEquation), remove (removePlace, removeTransition, removeArc, removeType, removeTypeElement, removeParameter, removeDifferentialEquation) or edit existing parts of the net (updatePlace, updateTransition, updateArcWeight, updateArcType, updateType, updateTypeElement, updateParameter, updateDifferentialEquation). To correct something that already exists, edit it by ID with only the fields that change; do not remove and re-add it. removePlace also removes arcs connected to that place; removeType and removeDifferentialEquation clear the places that referenced them, so code that read those tokens or parameters will need repair. Each operation is a flat {operationId, basisId, type, input} object. Every operation must cite one deduplicated declared basis via basisId and the exact preceding browser observation/base. A structurally applied batch is not compiler-clean; after a batch that writes code or changes a dependency of code, obtain read_petrinaut_diagnostics before relying on the result. Operations commit in order; failure stops and leaves later operations unattempted, so place addType, addParameter and addDifferentialEquation before the places and transitions that reference them, and addPlace/addTransition before the arcs that connect them.",
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
