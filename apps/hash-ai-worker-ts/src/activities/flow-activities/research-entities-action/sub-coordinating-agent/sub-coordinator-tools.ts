import type { Subtype } from "@local/advanced-types/subtype";
import type { FlowDataSources } from "@local/hash-isomorphic-utils/flows/types";

import type { LlmToolDefinition } from "../../../shared/get-llm-response/types.js";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "../shared/coordinator-tools.js";
import { generateToolDefinitions as generateCoordinatorToolDefinitions } from "../shared/coordinator-tools.js";

const omittedCoordinatorToolNames = [
  "complete",
  "delegateResearchTasks",
  "requestHumanInput",
] as const;

type OmittedCoordinatorToolNames = Subtype<
  CoordinatorToolName,
  (typeof omittedCoordinatorToolNames)[number]
>;

const subCoordinatingAgentCustomToolNames = ["complete"] as const;

type SubCoordinatingAgentCustomToolName =
  (typeof subCoordinatingAgentCustomToolNames)[number];

export type SubCoordinatingAgentToolName =
  | Exclude<CoordinatorToolName, OmittedCoordinatorToolNames>
  | SubCoordinatingAgentCustomToolName;

/**
 * Generate tool definitions for the sub-coordinating agent, to be passed to the LLM.
 */
export const generateToolDefinitions = <
  T extends SubCoordinatingAgentCustomToolName[],
>(params: {
  dataSources: FlowDataSources;
  omitTools: T;
}): Record<
  Exclude<SubCoordinatingAgentToolName, T[number]>,
  LlmToolDefinition<Exclude<SubCoordinatingAgentToolName, T[number]>>
> => {
  const coordinatorToolDefinitions = generateCoordinatorToolDefinitions({
    dataSources: params.dataSources,
    omitTools: omittedCoordinatorToolNames.concat(),
  });

  const allToolDefinitions = {
    ...coordinatorToolDefinitions,
    complete: {
      name: "complete",
      description: "Complete the task.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanation: {
            type: "string",
            description:
              "The explanation for how the gathered claims satisfy the research task.",
          },
        },
      },
    },
  };

  const filteredToolDefinitions = Object.fromEntries(
    Object.entries(allToolDefinitions).filter(
      ([toolName]) => !params.omitTools.includes(toolName as T[number]),
    ),
  ) as Record<
    Exclude<SubCoordinatingAgentToolName, T[number]>,
    LlmToolDefinition<Exclude<SubCoordinatingAgentToolName, T[number]>>
  >;

  return filteredToolDefinitions;
};

export type SubCoordinatingAgentToolCallArguments = Subtype<
  Record<SubCoordinatingAgentToolName, unknown>,
  {
    complete: {
      explanation: string;
    };
  } & Omit<CoordinatorToolCallArguments, OmittedCoordinatorToolNames>
>;
