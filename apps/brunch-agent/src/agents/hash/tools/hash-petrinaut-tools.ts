/**
 * The HASH agent's Petrinaut tools: Brunch's names over Petrinaut's canonical
 * operations, each naming the editor it acts on, as shared with HASH's page
 * through `@hashintel/brunch-agent`. HASH's process page runs them; a call
 * naming an editor the page doesn't show is never issued.
 */

import { defineTool } from "@flue/runtime";

import {
  hashPetrinautTools,
  type HashPetrinautToolName,
  hashProcessEditorId,
  unknownEditorRefusal,
} from "@hashintel/brunch-agent";

import {
  type BrowserToolExecutor,
  browserResultEnvelope,
} from "../../../shared/conversation/browser-tool-executor.ts";

/** HASH's Petrinaut tools, executed by whatever `execute` reaches HASH's page through. */
export const createHashPetrinautTools = (execute: BrowserToolExecutor) =>
  (Object.keys(hashPetrinautTools) as HashPetrinautToolName[]).map(
    (toolName) => {
      const { description, zInput } = hashPetrinautTools[toolName];
      return defineTool({
        name: toolName,
        description,
        input: zInput,
        run: async ({ data, toolCallId, signal }) => {
          if (data.editor_id !== hashProcessEditorId)
            throw new Error(unknownEditorRefusal(data.editor_id));
          const result = await execute({
            toolName,
            input: data,
            toolCallId,
            signal,
          });
          return { output: browserResultEnvelope(result), terminate: false };
        },
      });
    },
  );
