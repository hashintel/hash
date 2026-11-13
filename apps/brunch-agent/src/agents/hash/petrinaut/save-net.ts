/**
 * The HASH agent's Save as a Flue tool. Its input and outcome, its description
 * and what the model is shown of its result are shared with HASH's page
 * through `@hashintel/brunch-agent`. HASH's process page runs it through its
 * editor's own Save, once the user approves it on a card; this module never
 * reaches HASH.
 */

import { defineTool } from "@flue/runtime";

import {
  brunchTools,
  hashSaveDescription,
  hashSaveForModel,
  hashSaveUnconfirmedNote,
  vHashSaveInput,
} from "@hashintel/brunch-agent";

import { BrowserCallNotStartedError } from "../../../shared/conversation/browser-call-rendezvous.ts";
import {
  type BrowserToolExecutor,
  browserResultEnvelope,
} from "../../../shared/conversation/browser-tool-executor.ts";

/** The save of the bound net, executed by whatever `execute` reaches HASH through. */
export const createHashPetrinautSaveTool = (
  execute: BrowserToolExecutor,
  documentId: string,
) =>
  defineTool({
    name: brunchTools.appSaveNet,
    description: hashSaveDescription(documentId),
    input: vHashSaveInput,
    run: async ({ data, toolCallId, signal }) => {
      try {
        const result = await execute({
          toolName: brunchTools.appSaveNet,
          input: data,
          toolCallId,
          signal,
        });
        return {
          output: browserResultEnvelope({
            ...result,
            output: hashSaveForModel(result.output),
          }),
          terminate: false,
        };
      } catch (error) {
        // A save never issued to, or never started by, the page wrote nothing.
        // Any other failure, an answer in an unknown shape included, may have
        // followed a save the page started.
        if (error instanceof BrowserCallNotStartedError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message} ${hashSaveUnconfirmedNote}`, {
          cause: error,
        });
      }
    },
  });
