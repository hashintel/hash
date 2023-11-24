import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  AccountGroupEntityId,
  AccountId,
  Entity,
  extractAccountGroupId,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  OwnedById,
  Uuid,
} from "@local/hash-subgraph";

import { addAccountGroupMember } from "../../../../graph/account-permission-management";
import {
  archiveEntity,
  getLatestEntityById,
} from "../../../../graph/knowledge/primitive/entity";
import {
  getLinearIntegrationById,
  getSyncedWorkspacesForLinearIntegration,
  linkIntegrationToWorkspace,
} from "../../../../graph/knowledge/system-types/linear-integration-entity";
import { getLinearUserSecretByLinearOrgId } from "../../../../graph/knowledge/system-types/linear-user-secret";
import { systemAccountId } from "../../../../graph/system-account";
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
  { dataSources, authentication, temporal, vault },
) => {
  if (!vault) {
    throw new Error("Vault client not available");
  }

  if (!temporal) {
    throw new Error("Temporal client not available");
  }

  const linearIntegration = await getLinearIntegrationById(
    dataSources,
    authentication,
    {
      entityId: linearIntegrationEntityId,
    },
  );

  const userAccountId = extractOwnedByIdFromEntityId(
    linearIntegration.entity.metadata.recordId.entityId,
  ) as AccountId;

  const linearUserSecret = await getLinearUserSecretByLinearOrgId(
    dataSources,
    authentication,
    {
      userAccountId,
      linearOrgId: linearIntegration.linearOrgId,
    },
  );

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
    await getSyncedWorkspacesForLinearIntegration(dataSources, authentication, {
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
    ...removedSyncedWorkspaces.map(
      async ({ syncLinearDataWithLinkEntity, workspaceEntity }) => {
        if (
          workspaceEntity.metadata.entityTypeId ===
          systemEntityTypes.organization.entityTypeId
        ) {
          /** @todo: remove system account id as account group member if there are no other integrations */
        }

        return archiveEntity(dataSources, authentication, {
          entity: syncLinearDataWithLinkEntity,
        });
      },
    ),
    ...syncWithWorkspaces.map(async ({ workspaceEntityId, linearTeamIds }) => {
      const workspaceOwnedById = extractEntityUuidFromEntityId(
        workspaceEntityId,
      ) as Uuid as OwnedById;

      const userOrOrganizationEntity = await getLatestEntityById(
        dataSources,
        authentication,
        { entityId: workspaceEntityId },
      );

      if (
        userOrOrganizationEntity.metadata.entityTypeId ===
        systemEntityTypes.organization.entityTypeId
      ) {
        const accountGroupId = extractAccountGroupId(
          workspaceEntityId as AccountGroupEntityId,
        );

        await addAccountGroupMember(dataSources, authentication, {
          accountGroupId,
          accountId: systemAccountId,
        });
      } else {
        /**
         * @todo fix this by finding a way of giving the system account
         * read/write access to specific types in the user's workspace
         */
        throw new Error("Cannot sync with user workspace");
      }

      return Promise.all([
        linearClient.triggerWorkspaceSync({
          authentication: { actorId: systemAccountId },
          workspaceOwnedById,
          teamIds: linearTeamIds,
        }),
        linkIntegrationToWorkspace(dataSources, authentication, {
          linearIntegrationEntityId,
          workspaceEntityId,
          linearTeamIds,
        }),
      ]);
    }),
  ]);

  return linearIntegration.entity;
};
