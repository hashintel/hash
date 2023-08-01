import {
  Entity,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";

import { archiveEntity } from "../../../../graph/knowledge/primitive/entity";
import {
  getLinearIntegrationById,
  getSyncedWorkspacesForLinearIntegration,
  linkIntegrationToWorkspace,
} from "../../../../graph/knowledge/system-types/linear-integration-entity";
import { getLinearUserSecretByLinearOrgId } from "../../../../graph/knowledge/system-types/linear-user-secret";
import { Linear } from "../../../../integrations/linear";
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
  { dataSources, user, temporal, vault },
) => {
  if (!vault) {
    throw new Error("Vault client not available");
  }

  if (!temporal) {
    throw new Error("Temporal client not available");
  }

  const linearIntegration = await getLinearIntegrationById(dataSources, {
    entityId: linearIntegrationEntityId,
  });

  const userAccountId = extractOwnedByIdFromEntityId(
    linearIntegration.entity.metadata.recordId.entityId,
  );

  const linearUserSecret = await getLinearUserSecretByLinearOrgId(dataSources, {
    userAccountId,
    linearOrgId: linearIntegration.linearOrgId,
  });

  const vaultSecret = await vault.read<{ value: string }>({
    secretMountPath: "secret",
    path: linearUserSecret.vaultPath,
  });

  const apiKey = vaultSecret.data.value;

  const linearClient = new Linear({
    temporalClient: temporal,
    apiKey,
  });

  const existingSyncedWorkspaces =
    await getSyncedWorkspacesForLinearIntegration(dataSources, {
      linearIntegrationEntityId,
    });

  const removedSyncedWorkspaces = existingSyncedWorkspaces.filter(
    ({ workspaceEntity }) =>
      !syncWithWorkspaces.some(
        ({ workspaceEntityId }) =>
          workspaceEntity.metadata.recordId.entityId === workspaceEntityId,
      ),
  );

  await Promise.all([
    ...removedSyncedWorkspaces.map(({ syncLinearDataWithLinkEntity }) =>
      archiveEntity(dataSources, {
        entity: syncLinearDataWithLinkEntity,
        actorId: user.accountId,
      }),
    ),
    ...syncWithWorkspaces.map(async ({ workspaceEntityId, linearTeamIds }) => {
      const workspaceAccountId =
        extractEntityUuidFromEntityId(workspaceEntityId);
      return Promise.all([
        linearClient.triggerWorkspaceSync({
          workspaceAccountId,
          actorId: user.accountId,
          teamIds: linearTeamIds,
        }),
        linkIntegrationToWorkspace(dataSources, {
          linearIntegrationEntityId,
          workspaceEntityId,
          linearTeamIds,
          actorId: user.accountId,
        }),
      ]);
    }),
  ]);

  return linearIntegration.entity;
};
