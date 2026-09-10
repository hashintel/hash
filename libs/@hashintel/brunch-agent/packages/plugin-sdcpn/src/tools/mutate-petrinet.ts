import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";

import { validateDeclaredBasis } from "../declared-basis";
import {
  mutatePetrinetInputSchema,
  mutatePetrinetToolName,
} from "../mutate-petrinet";

import type { ObservedConstructionOptions } from "./petrinaut-construction";

export const createMutatePetrinetTool = (
  options: ObservedConstructionOptions,
) =>
  defineTool({
    name: mutatePetrinetToolName,
    description:
      "Apply one ordered batch of addPlace, addTransition, and addArc operations. Each operation is a flat {operationId, basisId, type, input} object. Every operation must cite one deduplicated declared basis via basisId and the exact preceding browser observation/base. Operations commit in order; failure stops and leaves later operations unattempted.",
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
