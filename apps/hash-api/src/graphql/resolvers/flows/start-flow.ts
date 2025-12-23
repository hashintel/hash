import type { EntityUuid } from "@blockprotocol/type-system";
import {
  type RunFlowWorkflowParams,
  type RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";
import { validateFlowDefinition } from "@local/hash-isomorphic-utils/flows/util";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import {
  FlowType,
  type MutationStartFlowArgs,
  type ResolverFn,
} from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";
import * as Error from "../../error";

export const startFlow: ResolverFn<
  Promise<EntityUuid>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationStartFlowArgs
> = async (
  _,
  { dataSources, flowTrigger, flowDefinition, flowType, webId },
  graphQLContext,
) => {
  const { temporal, user } = graphQLContext;

  if (flowType === FlowType.Ai && !user.enabledFeatureFlags.includes("ai")) {
    throw Error.forbidden("AI flows are not enabled for this user");
  }

  validateFlowDefinition(flowDefinition, flowType);

  const workflowId = generateUuid();

  const params: RunFlowWorkflowParams = {
    flowTrigger,
    flowDefinition,
    userAuthentication: { actorId: user.accountId },
    webId,
  };

  if (flowType === FlowType.Ai) {
    if (!("dataSources" in params)) {
      throw Error.badRequest("Data sources are required for AI flows");
    }
    params.dataSources = dataSources;
  }

  await temporal.workflow.start<
    (params: RunFlowWorkflowParams) => Promise<RunFlowWorkflowResponse>
  >("runFlow", {
    taskQueue: flowType,
    args: [params],
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
