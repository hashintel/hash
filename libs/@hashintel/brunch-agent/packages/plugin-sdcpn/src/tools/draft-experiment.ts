import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";

import {
  draftPetrinautExperimentInputSchema,
  draftPetrinautExperimentToolName,
} from "../draft-experiment";

import type { WorkpieceAuthorityOptions } from "./petrinaut-construction";

/**
 * Drafts one experiment for this conversation. The server resolves the settled
 * Ledger and canonical read from history, not from model-authored identities,
 * and hands the proposal to the browser, which prepares it against the
 * live model and shows it as drafted, not run. Nothing here starts a run.
 */
export const createDraftExperimentTool = (
  options: WorkpieceAuthorityOptions & {
    authorizeDraft: (toolCallId: string) => Promise<{
      revisionId: string;
    }>;
  },
) =>
  defineTool({
    name: draftPetrinautExperimentToolName,
    description:
      "Draft one experiment from the latest settled Ledger and canonical getLatestNetDefinition read in this conversation. Use saved identifiers from that read. The browser prepares the proposal against the live model and shows it as drafted, not run, with Run and Dismiss; the person starts it. Carry every restriction the request cannot enforce in `unsupported` — the request has no constraints — and never fold one into the objective. Call once per meaningful configuration; a later call supersedes the earlier draft. Do not call this to run an experiment.",
    input: draftPetrinautExperimentInputSchema,
    output: v.object({ awaiting: v.literal(AWAITING_CLIENT) }),
    async run({ toolCallId }) {
      const revision = options.currentRevision;
      if (!revision)
        throw new Error(
          "Settle a Ledger revision before drafting an experiment.",
        );
      const authority = await options.authorizeDraft(toolCallId);
      if (authority.revisionId !== revision.revisionId)
        throw new Error("Experiment draft Ledger basis is stale or unsettled.");
      return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
    },
  });
