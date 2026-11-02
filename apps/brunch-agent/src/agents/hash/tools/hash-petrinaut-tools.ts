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
} from "@hashintel/brunch-agent";

import {
  type BrowserToolExecutor,
  browserResultEnvelope,
} from "../../../shared/conversation/browser-tool-executor.ts";
import { noNetViewRefusalNaming } from "../../../shared/conversation/net-freshness.ts";

/** Why a call naming another editor was not started. */
export const unknownEditorRefusal = (editorId: string) =>
  `Not started: editor_id ${JSON.stringify(editorId)} names no open editor; the open editor is ${JSON.stringify(hashProcessEditorId)}.`;

/** Why a change with no current view of the net in context was not started, naming HASH's read. */
export const hashNoNetViewRefusal = noNetViewRefusalNaming("petrinaut_get_net");

/** HASH's Petrinaut tools, executed by whatever `execute` reaches HASH's page through. */
export const createHashPetrinautTools = (execute: BrowserToolExecutor) =>
  (Object.keys(hashPetrinautTools) as HashPetrinautToolName[]).map(
    (toolName) => {
      const { description, inputSchema } = hashPetrinautTools[toolName];
      return defineTool({
        name: toolName,
        description,
        input: inputSchema,
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
