import { defineTool } from "@flue/runtime";

import {
  CANONICAL_PETRINAUT_TOOL_NAMES,
  netReaderDescriptions,
  vNetReaderInput,
  type NetReaderLevel,
  netReaderToolNames,
} from "@hashintel/brunch-agent";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  browserResultEnvelope,
  type BrowserToolExecutor,
} from "../conversation/browser-tool-executor.ts";

/** The browser runs `getLatestNetDefinition` and returns only the requested view. */
export const netReaderTools = (execute: BrowserToolExecutor) =>
  (Object.keys(netReaderToolNames) as NetReaderLevel[]).map((level) =>
    defineTool({
      name: netReaderToolNames[level],
      description: netReaderDescriptions[level],
      input: vNetReaderInput,
      async run({ data, toolCallId, signal }) {
        const result = await execute({
          toolName: netReaderToolNames[level],
          input: data,
          toolCallId,
          signal,
        });
        return { output: browserResultEnvelope(result), terminate: false };
      },
    }),
  );

export const asyncCanonicalPetrinautTools = (execute: BrowserToolExecutor) =>
  CANONICAL_PETRINAUT_TOOL_NAMES.map((toolName) => {
    const tool = petrinautAiTools[toolName];
    return defineTool({
      name: toolName,
      description: tool.description,
      input: tool.inputSchema,
      async run({ data, toolCallId, signal }) {
        const result = await execute({
          toolName,
          input: data,
          toolCallId,
          signal,
        });
        return { output: browserResultEnvelope(result), terminate: false };
      },
    });
  });
