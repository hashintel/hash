import { AgentTypeOutput } from "@apps/hash-agents";

import { MutationCallAgentRunnerArgs, ResolverFn } from "../../api-types.gen";
import { LoggedInGraphQLContext } from "../../context";

export const callAgentRunnerResolver: ResolverFn<
  Promise<AgentTypeOutput>,
  {},
  LoggedInGraphQLContext,
  MutationCallAgentRunnerArgs
> = async (_, { payload }, { dataSources: { agentRunner } }, __) => {
  if (!agentRunner) {
    throw new Error("Agents are unavilable.");
  }

  const result = await agentRunner.runAgent(payload.Agent, payload.Input);
  return { Agent: payload.Agent, Output: result };
};
