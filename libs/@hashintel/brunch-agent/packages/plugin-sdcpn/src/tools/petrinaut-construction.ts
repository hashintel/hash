import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { awaitingClient } from "@hashintel/brunch-agent/constants";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { CANONICAL_PETRINAUT_TOOL_NAMES } from "../construction-tool-names";

import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

export interface WorkpieceAuthorityOptions {
  readonly currentRevision: WorkpieceRevision | null;
  readonly retainedRevisionFor: (
    revisionId: string,
  ) => Promise<WorkpieceRevision | undefined>;
}

const canonicalPetrinautTool = (toolName: keyof typeof petrinautAiTools) => {
  const tool = petrinautAiTools[toolName];
  return defineTool({
    name: toolName,
    description: tool.description,
    input: tool.inputSchema,
    output: v.object({ awaiting: v.literal(awaitingClient) }),
    run() {
      return { output: { awaiting: awaitingClient }, terminate: true };
    },
  });
};

/** F presents exactly Petrinaut's prompt and catalogue over Flue. */
export const canonicalPetrinautTools = CANONICAL_PETRINAUT_TOOL_NAMES.map(
  canonicalPetrinautTool,
);

type CanonicalJson =
  | string
  | number
  | boolean
  | null
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

/** I returns canonical output to the model; the envelope remains host-only. */
export const asyncCanonicalPetrinautTools = (
  execute: (call: {
    readonly toolName: keyof typeof petrinautAiTools;
    readonly input: unknown;
    readonly toolCallId: string;
    readonly signal?: AbortSignal;
  }) => Promise<{ readonly output: unknown; readonly metadata?: unknown }>,
) =>
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
        return {
          output: JSON.parse(
            JSON.stringify({
              brunchBrowserResult: true,
              output: result.output,
              ...(result.metadata === undefined
                ? {}
                : { metadata: result.metadata }),
            }),
          ) as CanonicalJson,
          terminate: false,
        };
      },
    });
  });
