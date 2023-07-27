import { Entity, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { ForbiddenError } from "apollo-server-errors";

import {
  getLinearIntegrationById,
  syncLinearIntegrationWithWorkspace,
} from "../../../../graph/knowledge/system-types/linear-integration-entity";
import {
  MutationSyncLinearIntegrationWithWorkspacesArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";

export const syncLinearIntegrationWithWorkspacesMutation: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  MutationSyncLinearIntegrationWithWorkspacesArgs
> = async (
  _,
  { linearIntegrationEntityId, syncWithWorkspaces },
  { dataSources, user },
) => {
  const linearIntegration = await getLinearIntegrationById(dataSources, {
    entityId: linearIntegrationEntityId,
  });

  const linearIntegrationOwnedById = extractOwnedByIdFromEntityId(
    linearIntegration.entity.metadata.recordId.entityId,
  );

  if (linearIntegrationOwnedById !== user.accountId) {
    throw new ForbiddenError("User does not own the linear integration");
  }

  await Promise.all(
    syncWithWorkspaces.map(async ({ workspaceEntityId, linearTeamIds }) =>
      syncLinearIntegrationWithWorkspace(dataSources, {
        linearIntegrationEntityId,
        workspaceEntityId,
        linearTeamIds,
        actorId: user.accountId,
      }),
    ),
  );

  /** @todo: trigger temporal workflow for syncing the relevant linear team data with the workspaces */

  return linearIntegration.entity;
};
