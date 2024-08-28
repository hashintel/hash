import type { FlowDataSources } from "@local/hash-isomorphic-utils/flows/types";

import type { LlmToolDefinition } from "../../../shared/get-llm-response/types.js";
import type {
  SubCoordinatingAgentCustomToolName,
  SubCoordinatingAgentToolName,
} from "../shared/coordinator-tools.js";
import {
  generateToolDefinitions as generateCoordinatorToolDefinitions,
  subCoordinatorOmittedCoordinatorToolNames,
} from "../shared/coordinator-tools.js";
import type { SubCoordinatingAgentState } from "./state.js";

/**
 * Generate tool definitions for the sub-coordinating agent, to be passed to the LLM.
 */
export const generateToolDefinitions = <
  T extends SubCoordinatingAgentCustomToolName[],
>(params: {
  dataSources: FlowDataSources;
  omitTools: T;
  state: SubCoordinatingAgentState;
}): Record<
  Exclude<SubCoordinatingAgentToolName, T[number]>,
  LlmToolDefinition<Exclude<SubCoordinatingAgentToolName, T[number]>>
> => {
  const coordinatorToolDefinitions = generateCoordinatorToolDefinitions({
    dataSources: params.dataSources,
    omitTools: subCoordinatorOmittedCoordinatorToolNames.concat(),
    state: params.state,
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
