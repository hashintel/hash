import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";

import { validateDeclaredBasis } from "../declared-basis";
import {
  draftPetrinautExperimentInputSchema,
  draftPetrinautExperimentToolName,
} from "../draft-experiment";

import type { ObservedConstructionOptions } from "./petrinaut-construction";

/**
 * Drafts one experiment for this session. The server checks provenance — the
 * cited workpiece basis and the exact net observation the identifiers came
 * from — and hands the proposal to the browser, which prepares it against the
 * live model and shows it as drafted, not run. Nothing here starts a run.
 */
export const createDraftExperimentTool = (
  options: ObservedConstructionOptions,
) =>
  defineTool({
    name: draftPetrinautExperimentToolName,
    description:
      "Draft one experiment for this session once the settled workpiece states the decision, the measure and its direction, a tunable quantity with its range and unit, and the regime and horizon, and the current net has the saved scenario, the typed scenario parameter and the saved metric. Copy every identifier from the cited read_petrinaut_net observation. The browser prepares the proposal against the live model and shows it as drafted, not run, with Run and Dismiss; the person starts it. Carry every restriction the request cannot enforce in `unsupported` — the request has no constraints — and never fold one into the objective. Call once per meaningful configuration; a later call supersedes the earlier draft. Do not call this to run an experiment.",
    input: draftPetrinautExperimentInputSchema,
    output: v.object({ awaiting: v.literal(AWAITING_CLIENT) }),
    async run({ data }) {
      if (!options.currentRevision)
        throw new Error("Settle the workpiece before drafting an experiment.");
      await validateDeclaredBasis(
        data.basis,
        options.currentRevision,
        options.retainedRevisionFor,
      );
      const observation = await options.observationFor(
        data.observation.toolCallId,
      );
      if (observation.sha256 !== data.observation.baseHash)
        throw new Error(
          "Experiment draft base differs from the verified browser observation.",
        );
      return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
    },
  });
