import { defineTool } from "@flue/runtime";

import { brunchTools } from "@hashintel/brunch-agent/constants";

import { draftPetrinautExperimentInputSchema } from "../draft-experiment";
import {
  browserResultEnvelope,
  type BrowserToolExecutor,
  type WorkpieceAuthorityOptions,
} from "./petrinaut-construction";

/**
 * Drafts one experiment for this conversation. The server resolves the settled
 * Ledger and canonical read from history, not from model-authored identities,
 * then issues the proposal to the browser, which prepares it against the live
 * model, shows it as drafted, not run, and returns that preparation as this
 * call's result. Nothing here starts a run.
 */
export const createDraftExperimentTool = (
  options: WorkpieceAuthorityOptions & {
    authorizeDraft: (toolCallId: string) => Promise<{
      revisionId: string;
    }>;
    executeBrowserTool: BrowserToolExecutor;
  },
) =>
  defineTool({
    name: brunchTools.draftPetrinautExperiment,
    description:
      "Draft one experiment from the latest settled Ledger and canonical getLatestNetDefinition read in this conversation. Use saved identifiers from that read. The browser prepares the proposal against the live model and shows it as drafted, not run, with Run and Dismiss; the person starts it. Carry every restriction the request cannot enforce in `unsupported` — the request has no constraints — and never fold one into the objective. Call once per meaningful configuration; a later call supersedes the earlier draft. Do not call this to run an experiment.",
    input: draftPetrinautExperimentInputSchema,
    async run({ data, toolCallId, signal }) {
      const revision = options.currentRevision;
      if (!revision)
        throw new Error(
          "Settle a Ledger revision before drafting an experiment.",
        );
      const authority = await options.authorizeDraft(toolCallId);
      if (authority.revisionId !== revision.revisionId)
        throw new Error("Experiment draft Ledger basis is stale or unsettled.");
      const result = await options.executeBrowserTool({
        toolName: brunchTools.draftPetrinautExperiment,
        input: data,
        toolCallId,
        signal,
      });
      return { output: browserResultEnvelope(result), terminate: false };
    },
  });
