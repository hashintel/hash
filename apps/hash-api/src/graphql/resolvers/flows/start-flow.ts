import type { EntityUuid } from "@blockprotocol/type-system";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import { validateFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { ForbiddenError } from "apollo-server-errors";

import type { MutationStartFlowArgs, ResolverFn } from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";

export const startFlow: ResolverFn<
  Promise<EntityUuid>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationStartFlowArgs
> = async (
  _,
  { dataSources, flowTrigger, flowDefinition, webId },
  graphQLContext,
) => {
  const { temporal, user } = graphQLContext;

  if (!user.enabledFeatureFlags.includes("ai")) {
    throw new ForbiddenError("Flows are not enabled for this user");
  }

  validateFlowDefinition(flowDefinition);

  const workflowId = generateUuid();

  await temporal.workflow.start<
    (params: RunFlowWorkflowParams) => Promise<RunFlowWorkflowResponse>
  >("runFlow", {
    taskQueue: "ai",
    args: [
      {
        dataSources,
        flowTrigger,
        flowDefinition,
        userAuthentication: { actorId: user.accountId },
        webId,
      },
    ],
    memo: {
      flowDefinitionId: flowDefinition.flowDefinitionId,
      userAccountId: user.accountId,
      webId,
    },
    workflowId,
    retry: {
      maximumAttempts: 1,
    },
  });

  return workflowId as EntityUuid;
};
