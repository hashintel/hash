import { defineTool } from "@flue/runtime";

import {
  CANONICAL_PETRINAUT_TOOL_NAMES,
  netReaderDescriptions,
  netReaderInputSchema,
  type NetReaderLevel,
  netReaderToolNames,
  type BrowserToolEnvelope,
  type ClientToolResult,
} from "@hashintel/brunch-agent";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import type { JsonValue } from "@flue/runtime";

/** What the bound browser settles a call with, without its correlation. */
type BrowserToolResult = Pick<ClientToolResult, "output" | "metadata">;

/** Issues one call to the bound browser and resolves with its settled result. */
export type BrowserToolExecutor = (call: {
  readonly toolName: string;
  readonly input: unknown;
  readonly toolCallId: string;
  readonly signal?: AbortSignal;
}) => Promise<BrowserToolResult>;

/** The browser's output goes to the model; the envelope and its metadata stay host-only. */
export const browserResultEnvelope = (result: BrowserToolResult) =>
  JSON.parse(
    JSON.stringify({
      brunchBrowserResult: true,
      output: result.output,
      ...(result.metadata === undefined ? {} : { metadata: result.metadata }),
    } satisfies BrowserToolEnvelope),
  ) as BrowserToolEnvelope & JsonValue;

/** The browser runs `getLatestNetDefinition` and returns only the requested view. */
export const netReaderTools = (execute: BrowserToolExecutor) =>
  (Object.keys(netReaderToolNames) as NetReaderLevel[]).map((level) =>
    defineTool({
      name: netReaderToolNames[level],
      description: netReaderDescriptions[level],
      input: netReaderInputSchema,
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
