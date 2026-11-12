import { defineTool } from "@flue/runtime";

import {
  brunchTools,
  draftPetrinautExperimentDescription,
  zDraftPetrinautExperimentInput,
} from "@hashintel/brunch-agent";

import {
  browserResultEnvelope,
  type BrowserToolExecutor,
} from "../conversation/browser-tool-executor.ts";

/**
 * Drafts one experiment for this conversation. The server resolves the
 * canonical read from history, not from model-authored identities, then issues
 * the proposal to the browser, which prepares it against the live model, shows
 * it as drafted, not run, and returns that preparation as this call's result.
 * Nothing here starts a run.
 */
export const createDraftExperimentTool = (options: {
  authorizeDraft: (toolCallId: string) => Promise<void>;
  executeBrowserTool: BrowserToolExecutor;
}) =>
  defineTool({
    name: brunchTools.draftPetrinautExperiment,
    description: draftPetrinautExperimentDescription,
    input: zDraftPetrinautExperimentInput,
    async run({ data, toolCallId, signal }) {
      await options.authorizeDraft(toolCallId);
      const result = await options.executeBrowserTool({
        toolName: brunchTools.draftPetrinautExperiment,
        input: data,
        toolCallId,
        signal,
      });
      return { output: browserResultEnvelope(result), terminate: false };
    },
  });
