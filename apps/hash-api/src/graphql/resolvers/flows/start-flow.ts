import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import {
  type MutationStartFlowArgs,
  type ResolverFn,
} from "../../api-types.gen";
import * as Error from "../../error";
import { getRunnableFlowDefinition } from "./shared/get-runnable-flow-definition";

import type { LoggedInGraphQLContext } from "../../context";
import type { EntityUuid } from "@blockprotocol/type-system";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";

export const startFlow: ResolverFn<
  Promise<EntityUuid>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationStartFlowArgs
> = async (
  _,
  {
    dataSources,
    flowDefinition: flowDefinitionInput,
    flowDefinitionId,
    flowInputs,
    webId,
  },
  graphQLContext,
) => {
  const { temporal, user } = graphQLContext;

  const { flowDefinition, flowType } = getRunnableFlowDefinition(
    graphQLContext,
    flowDefinitionInput,
  );

  const workflowId = generateUuid() as EntityUuid;

  if (flowType === "ai" && !dataSources) {
    throw Error.badRequest("Data sources are required for AI flows");
  }

  const params: RunFlowWorkflowParams = {
    ...(flowType === "ai" ? { dataSources } : {}),
    flowRunId: workflowId,
    flowInputs,
    flowDefinition,
    flowDefinitionId,
    userAuthentication: { actorId: user.accountId },
    webId,
  };

  await temporal.workflow.start<
    (params: RunFlowWorkflowParams) => Promise<RunFlowWorkflowResponse>
  >("runFlow", {
    taskQueue: flowType,
    args: [params],
    memo: {
      flowDefinitionId,
      userAccountId: user.accountId,
      webId,
    },
    workflowId,
    retry: {
      maximumAttempts: 1,
    },
  });

  return workflowId;
};
