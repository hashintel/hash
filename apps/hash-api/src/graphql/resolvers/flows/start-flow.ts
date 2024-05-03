import type { JsonObject } from "@blockprotocol/core";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import { validateFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import type { MutationStartFlowArgs, ResolverFn } from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";

export const startFlow: ResolverFn<
  Promise<JsonObject>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationStartFlowArgs
> = async (_, { flowTrigger, flowDefinition, webId }, graphQLContext) => {
  const { temporal, user } = graphQLContext;

  validateFlowDefinition(flowDefinition);

  const workflowResponse = await temporal.workflow.execute<
    (params: RunFlowWorkflowParams) => Promise<RunFlowWorkflowResponse>
  >("runFlow", {
    taskQueue: "ai",
    args: [
      {
        flowTrigger,
        flowDefinition,
        userAuthentication: { actorId: user.accountId },
        webId,
      },
    ],
    memo: {
      flowDefinitionId: flowDefinition.flowDefinitionId,
    },
    workflowId: generateUuid(),
    retry: {
      maximumAttempts: 1,
    },
  });

  return workflowResponse as unknown as JsonObject;
};
