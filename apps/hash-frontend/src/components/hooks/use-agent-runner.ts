import { useQuery } from "@apollo/client";
import { AgentType } from "@apps/hash-agents";

import {
  CallAgentQuery,
  CallAgentQueryVariables,
} from "../../graphql/api-types.gen";
import { callAgentQuery } from "../../graphql/queries/agents.queries";

export const useAgentRunner = <T extends AgentType["Agent"]>(
  agent: T,
  input: Extract<AgentType, { Agent: T }>["Input"],
): {
  loading: boolean;
  output: Extract<AgentType, { Agent: T }>["Output"] | undefined;
} => {
  const { data, loading } = useQuery<CallAgentQuery, CallAgentQueryVariables>(
    callAgentQuery,
    {
      variables: {
        payload: {
          Agent: agent,
          Input: input,
        },
      },
      fetchPolicy: "no-cache",
    },
  );

  const { callAgent: agentResponse } = data ?? {};

  const output = agentResponse?.Output;

  return {
    loading,
    output,
  };
};
