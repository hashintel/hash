import { useQuery } from "@apollo/client";
import { AgentType } from "@apps/hash-agents";
import { useMemo } from "react";

import {
  CallAgentQuery,
  CallAgentQueryVariables,
} from "../../graphql/api-types.gen";
import { callAgentQuery } from "../../graphql/queries/agents.queries";

export const useAgent = <T extends AgentType>(
  agent: T["Agent"],
  input: T["Input"],
): { loading: boolean; output: T["Output"] | undefined } => {
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

  const output = useMemo(() => {
    if (!agentResponse) {
      return undefined;
    }

    return agentResponse.Output;
  }, [agentResponse]);

  return {
    loading,
    output,
  };
};
