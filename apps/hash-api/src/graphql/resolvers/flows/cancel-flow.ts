import type { EntityUuid } from "@blockprotocol/type-system";
import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { temporalNamespace } from "@local/hash-backend-utils/temporal";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import { checkEntityPermission } from "../../../graph/knowledge/primitive/entity";
import type { MutationResetFlowArgs, ResolverFn } from "../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../context";
import * as Error from "../../error";

export const cancelFlow: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationResetFlowArgs
> = async (
  _,
  { flowUuid },
  { authentication, dataSources, provenance, temporal, user },
) => {
  const flow = await getFlowRunEntityById({
    flowRunId: flowUuid as EntityUuid,
    graphApiClient: dataSources.graphApi,
    userAuthentication: authentication,
  });

  if (!flow) {
    throw Error.notFound(`Flow with id ${flowUuid} not found`);
  }

  const userCanModify = await checkEntityPermission(
    { graphApi: dataSources.graphApi, provenance },
    authentication,
    {
      entityId: flow.entityId,
      permission: "updateEntity",
    },
  );

  if (!userCanModify) {
    throw Error.forbidden("You do not have permission to cancel this flow.");
  }

  await temporal.workflowService.requestCancelWorkflowExecution({
    namespace: temporalNamespace,
    workflowExecution: {
      workflowId: flowUuid,
    },
    reason: `Cancelled via GraphQL API by @${user.shortname}`,
    requestId: generateUuid(),
  });

  return true;
};
