import { useMutation } from "@apollo/client";
import { AgentType } from "@apps/hash-agents";
import { useCallback } from "react";

import {
  CallAgentRunnerMutation,
  CallAgentRunnerMutationVariables,
} from "../../graphql/api-types.gen";
import { callAgentRunnerMutation } from "../../graphql/queries/agents.queries";

export const useAgentRunner = <T extends AgentType["Agent"]>(
  agent: T,
): [
  (
    input: Extract<AgentType, { Agent: T }>["Input"],
  ) => Promise<Extract<AgentType, { Agent: T }>["Output"] | undefined>,
  { readonly loading: boolean },
] => {
  const [callAgentRunnerFn, { loading }] = useMutation<
    CallAgentRunnerMutation,
    CallAgentRunnerMutationVariables
  >(callAgentRunnerMutation, {
    fetchPolicy: "no-cache",
  });

  const callAgentRunnerCallback = useCallback(
    async (input: Extract<AgentType, { Agent: T }>["Input"]) => {
      return (
        await callAgentRunnerFn({
          variables: {
            payload: {
              Agent: agent,
              Input: input,
            },
          },
        })
      ).data?.callAgentRunner.Output;
    },
    [agent, callAgentRunnerFn],
  );

  return [callAgentRunnerCallback, { loading }];
};
