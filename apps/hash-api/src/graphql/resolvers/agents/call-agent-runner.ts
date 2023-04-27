import { AgentTypeOutput } from "@apps/hash-agents";
import { ApolloError } from "apollo-server-errors";

import { MutationCallAgentRunnerArgs, ResolverFn } from "../../api-types.gen";
import { LoggedInGraphQLContext } from "../../context";

export const callAgentRunnerResolver: ResolverFn<
  Promise<AgentTypeOutput>,
  {},
  LoggedInGraphQLContext,
  MutationCallAgentRunnerArgs
> = async (_, { payload }, { dataSources: { agentRunner } }, __) => {
  if (!agentRunner) {
    throw new Error("Agents are unavailable.");
  }

  const result = await agentRunner.runAgent(payload.Agent, payload.Input);

  if ("error" in result) {
    throw new ApolloError(
      "An error occurred while running the agent.",
      "AGENT_ERROR",
      { result },
    );
  }

  return { Agent: payload.Agent, Output: result };
};
