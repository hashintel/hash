import { createHash } from "node:crypto";

import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";

import {
  draftPetrinautExperimentInputSchema,
  draftPetrinautExperimentToolName,
} from "../draft-experiment";

import type { DefinitionObservation } from "../mutation-record";
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
      observation: DefinitionObservation;
      revisionId: string;
    }>;
  },
) =>
  defineTool({
    name: draftPetrinautExperimentToolName,
    description:
      "Draft one experiment from a settled Ledger and the current canonical getLatestNetDefinition read in this conversation. The host resolves and verifies that read and Ledger: do not supply observation IDs, hashes, revisions, locators or a basis table. Use saved identifiers from the canonical read. The browser prepares the proposal against the live model and shows it as drafted, not run, with Run and Dismiss; the person starts it. Carry every restriction the request cannot enforce in `unsupported` — the request has no constraints — and never fold one into the objective. Call once per meaningful configuration; a later call supersedes the earlier draft. Do not call this to run an experiment.",
    input: draftPetrinautExperimentInputSchema,
    output: v.object({ awaiting: v.literal(AWAITING_CLIENT) }),
    async run({ toolCallId }) {
      const revision = options.currentRevision;
      if (
        !revision ||
        createHash("sha256").update(revision.markdown).digest("hex") !==
          revision.sha256
      )
        throw new Error(
          "Settle a valid Ledger revision before drafting an experiment.",
        );
      const authority = await options.authorizeDraft(toolCallId);
      if (authority.revisionId !== revision.revisionId)
        throw new Error("Experiment draft Ledger basis is stale or unsettled.");
      if (!authority.observation.sha256)
        throw new Error(
          "Experiment draft requires a verified canonical net read.",
        );
      return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
    },
  });
