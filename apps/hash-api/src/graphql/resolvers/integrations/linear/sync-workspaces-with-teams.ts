import { Entity } from "@local/hash-subgraph";

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

  return linearIntegration.entity;
};
