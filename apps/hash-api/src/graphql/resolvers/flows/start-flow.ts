import { entityIdFromComponents } from "@blockprotocol/type-system";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import {
  type MutationStartFlowArgs,
  type ResolverFn,
} from "../../api-types.gen";
import * as Error from "../../error";
import { getRunnableFlowDefinition } from "./shared/get-runnable-flow-definition";

import type { LoggedInGraphQLContext } from "../../context";
import type { EntityId, EntityUuid } from "@blockprotocol/type-system";
import type {
  RunFlowWorkflowParams,
  RunFlowWorkflowResponse,
} from "@local/hash-isomorphic-utils/flows/temporal-types";

export const startFlow: ResolverFn<
  Promise<EntityId>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationStartFlowArgs
> = async (
  _,
  { dataSources, flowInputs, flowDefinitionId, webId },
  graphQLContext,
) => {
  const { temporal, user } = graphQLContext;

  /*
   * Checked here so that a bad request fails before a run starts: the run loads the definition again when it does.
   */
  const { flowType } = await getRunnableFlowDefinition(
    graphQLContext,
    flowDefinitionId,
  );

  const workflowId = generateUuid() as EntityUuid;

  if (flowType === "ai" && !dataSources) {
    throw Error.badRequest("Data sources are required for AI flows");
  }

  const params: RunFlowWorkflowParams = {
    ...(flowType === "ai" ? { dataSources } : {}),
    flowRunEntityUuid: workflowId,
    flowInputs,
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

  return entityIdFromComponents(webId, workflowId);
};
