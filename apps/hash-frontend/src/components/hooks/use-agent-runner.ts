import { useMutation } from "@apollo/client";
import { Agent, AgentTypeInput, AgentTypeMap } from "@apps/hash-agents";
import { GraphQLError } from "graphql";
import { useCallback } from "react";

import {
  CallAgentRunnerMutation,
  CallAgentRunnerMutationVariables,
} from "../../graphql/api-types.gen";
import { callAgentRunnerMutation } from "../../graphql/queries/agents.queries";

type CallAgentRunnerCallback<T extends Agent> = (
  input: AgentTypeMap[T]["Input"],
) => Promise<{
  output?: AgentTypeMap[T]["Output"];
  errors?: readonly GraphQLError[];
}>;

export const useAgentRunner = <T extends Agent>(
  agent: T,
): [CallAgentRunnerCallback<T>, { readonly loading: boolean }] => {
  const [callAgentRunnerFn, { loading }] = useMutation<
    CallAgentRunnerMutation,
    CallAgentRunnerMutationVariables
  >(callAgentRunnerMutation, {
    fetchPolicy: "no-cache",
  });

  const callAgentRunnerCallback = useCallback<CallAgentRunnerCallback<T>>(
    async (input) => {
      // @ts-expect-error TypeScript is unaware that the input here matches the input type for the agent
      const payload: AgentTypeInput = { Agent: agent, Input: input };

      const { data, errors } = await callAgentRunnerFn({
        variables: {
          payload,
        },
      });

      const output = data?.callAgentRunner.Output;

      return { output, errors };
    },
    [agent, callAgentRunnerFn],
  );

  return [callAgentRunnerCallback, { loading }];
};
