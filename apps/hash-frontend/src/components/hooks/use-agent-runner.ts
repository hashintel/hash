import { useMutation } from "@apollo/client";
import { AgentType } from "@apps/hash-agents";
import { GraphQLError } from "graphql";
import { useCallback } from "react";

import {
  CallAgentRunnerMutation,
  CallAgentRunnerMutationVariables,
} from "../../graphql/api-types.gen";
import { callAgentRunnerMutation } from "../../graphql/queries/agents.queries";

type CallAgentRunnerCallback<T> = (
  input: Extract<AgentType, { Agent: T }>["Input"],
) => Promise<{
  output?: Extract<AgentType, { Agent: T }>["Output"];
  errors?: GraphQLError[];
}>;

export const useAgentRunner = <T extends AgentType["Agent"]>(
  agent: T,
): [CallAgentRunnerCallback<T>, { readonly loading: boolean }] => {
  const [callAgentRunnerFn, { loading }] = useMutation<
    CallAgentRunnerMutation,
    CallAgentRunnerMutationVariables
  >(callAgentRunnerMutation, {
    fetchPolicy: "no-cache",
  });

  const callAgentRunnerCallback = useCallback(
    async (input: Parameters<CallAgentRunnerCallback<T>>[0]) => {
      const { data, errors } = await callAgentRunnerFn({
        variables: {
          payload: { Agent: agent, Input: input },
        },
      });

      const output = data?.callAgentRunner.Output;

      return { output, errors };
    },
    [agent, callAgentRunnerFn],
  );

  return [
    callAgentRunnerCallback as unknown as CallAgentRunnerCallback<T>,
    { loading },
  ];
};
