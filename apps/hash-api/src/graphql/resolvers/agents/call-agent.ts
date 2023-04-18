import { AgentTypeOutput } from "@apps/hash-agents";

import { QueryCallAgentArgs, ResolverFn } from "../../api-types.gen";
import { LoggedInGraphQLContext } from "../../context";

export const callAgentResolver: ResolverFn<
  Promise<AgentTypeOutput>,
  {},
  LoggedInGraphQLContext,
  QueryCallAgentArgs
> = async (_, { payload }, { dataSources: { agentExecutor } }, __) => {
  if (!agentExecutor) {
    throw new Error("Agents are unavilable.");
  }

  const result = await agentExecutor.executeAgent(payload.Agent, payload.Input);
  return { Agent: payload.Agent, Output: result };
};
