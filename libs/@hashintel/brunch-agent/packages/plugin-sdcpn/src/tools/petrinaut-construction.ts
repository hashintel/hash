import { defineTool } from "@flue/runtime";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { CANONICAL_PETRINAUT_TOOL_NAMES } from "../construction-tool-names";

type CanonicalJson =
  | string
  | number
  | boolean
  | null
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

/** Issues one call to the bound browser and resolves with its settled result. */
export type BrowserToolExecutor = (call: {
  readonly toolName: string;
  readonly input: unknown;
  readonly toolCallId: string;
  readonly signal?: AbortSignal;
}) => Promise<{ readonly output: unknown; readonly metadata?: unknown }>;

/** The browser's output goes to the model; the envelope and its metadata stay host-only. */
export const browserResultEnvelope = (result: {
  readonly output: unknown;
  readonly metadata?: unknown;
}) =>
  JSON.parse(
    JSON.stringify({
      brunchBrowserResult: true,
      output: result.output,
      ...(result.metadata === undefined ? {} : { metadata: result.metadata }),
    }),
  ) as CanonicalJson;

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
