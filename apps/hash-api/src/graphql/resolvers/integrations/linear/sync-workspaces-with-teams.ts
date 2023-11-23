import {
  AccountId,
  Entity,
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  OwnedById,
  Uuid,
} from "@local/hash-subgraph";

import { archiveEntity } from "../../../../graph/knowledge/primitive/entity";
import {
  getLinearIntegrationById,
  getSyncedWorkspacesForLinearIntegration,
  linkIntegrationToWorkspace,
} from "../../../../graph/knowledge/system-types/linear-integration-entity";
import { getLinearUserSecretByLinearOrgId } from "../../../../graph/knowledge/system-types/linear-user-secret";
import { modifyWebAuthorizationRelationships } from "../../../../graph/ontology/primitive/util";
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
        const workspaceOwnedById = extractOwnedByIdFromEntityId(
          workspaceEntity.metadata.recordId.entityId,
        );

        console.log("deleting relation: ", {
          systemAccountId,
          workspaceOwnedById,
        });
        // Remove the system account as an owner of the workspace's web
        await modifyWebAuthorizationRelationships(dataSources, authentication, [
          {
            operation: "delete",
            relationship: {
              subject: {
                kind: "account",
                subjectId: systemAccountId,
              },
              resource: {
                kind: "web",
                resourceId: workspaceOwnedById,
              },
              relation: "owner",
            },
          },
        ]);

        return archiveEntity(dataSources, authentication, {
          entity: syncLinearDataWithLinkEntity,
        });
      },
    ),
    ...syncWithWorkspaces.map(async ({ workspaceEntityId, linearTeamIds }) => {
      const workspaceOwnedById = extractEntityUuidFromEntityId(
        workspaceEntityId,
      ) as Uuid as OwnedById;

      console.log("creating relation: ", {
        systemAccountId,
        workspaceOwnedById,
      });
      // Make the system account an owner of the workspace's web
      await modifyWebAuthorizationRelationships(dataSources, authentication, [
        {
          operation: "create",
          relationship: {
            subject: {
              kind: "account",
              subjectId: systemAccountId,
            },
            resource: {
              kind: "web",
              resourceId: workspaceOwnedById,
            },
            relation: "owner",
          },
        },
      ]);

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
