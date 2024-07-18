import {
  getMachineActorId,
  getWebMachineActorId,
} from "@local/hash-backend-utils/machine-actors";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { Uuid } from "@local/hash-graph-types/branded";
import type { OwnedById } from "@local/hash-graph-types/web";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";

import {
  getLatestEntityById,
  modifyEntityAuthorizationRelationships,
} from "../../../../graph/knowledge/primitive/entity";
import {
  getLinearIntegrationById,
  getSyncedWorkspacesForLinearIntegration,
  linkIntegrationToWorkspace,
} from "../../../../graph/knowledge/system-types/linear-integration-entity";
import { getLinearUserSecretByLinearOrgId } from "../../../../graph/knowledge/system-types/linear-user-secret";
import { systemAccountId } from "../../../../graph/system-account";
import { Linear } from "../../../../integrations/linear";
import type {
  MutationSyncLinearIntegrationWithWorkspacesArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const syncLinearIntegrationWithWorkspacesMutation: ResolverFn<
  Promise<Entity>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationSyncLinearIntegrationWithWorkspacesArgs
> = async (
  _,
  { linearIntegrationEntityId, syncWithWorkspaces },
  graphQLContext,
) => {
  const { dataSources, authentication, temporal, vault } = graphQLContext;

  if (!vault) {
    throw new Error("Vault client not available");
  }

  const impureGraphContext = graphQLContextToImpureGraphContext(graphQLContext);

  const linearIntegration = await getLinearIntegrationById(
    impureGraphContext,
    authentication,
    {
      entityId: linearIntegrationEntityId,
    },
  );

  const userAccountId = extractOwnedByIdFromEntityId(
    linearIntegration.entity.metadata.recordId.entityId,
  ) as AccountId;

  const linearUserSecret = await getLinearUserSecretByLinearOrgId(
    impureGraphContext,
    authentication,
    {
      userAccountId,
      linearOrgId: linearIntegration.linearOrgId,
    },
  );

  const vaultSecret = await vault.read<{ value: string }>({
    secretMountPath: "secret",
    path: linearUserSecret.vaultPath,
    userAccountId,
  });

  await Promise.all(
    [
      linearIntegration.entity.metadata.recordId.entityId,
      linearUserSecret.entity.metadata.recordId.entityId,
    ].map((entityId) =>
      modifyEntityAuthorizationRelationships(
        impureGraphContext,
        authentication,
        [
          {
            operation: "touch",
            relationship: {
              resource: { kind: "entity", resourceId: entityId },
              relation: "viewer",
              subject: { kind: "account", subjectId: systemAccountId },
            },
          },
        ],
      ),
    ),
  );

  const apiKey = vaultSecret.data.value;

  const linearClient = new Linear({
    temporalClient: temporal,
    apiKey,
  });

  const existingSyncedWorkspaces =
    await getSyncedWorkspacesForLinearIntegration(
      impureGraphContext,
      authentication,
      {
        linearIntegrationEntityId,
      },
    );

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

        return syncLinearDataWithLinkEntity.archive(
          impureGraphContext.graphApi,
          authentication,
        );
      },
    ),
    ...syncWithWorkspaces.map(async ({ workspaceEntityId, linearTeamIds }) => {
      const workspaceOwnedById = extractEntityUuidFromEntityId(
        workspaceEntityId,
      ) as Uuid as OwnedById;

      const userOrOrganizationEntity = await getLatestEntityById(
        impureGraphContext,
        authentication,
        { entityId: workspaceEntityId },
      );

      const webAccountId = extractEntityUuidFromEntityId(
        userOrOrganizationEntity.metadata.recordId.entityId,
      ) as Uuid as AccountId;

      /**
       * Add the Linear machine user to the web,
       * if it doesn't already have permission to read and edit entities in it.
       */
      const linearBotAccountId = await getMachineActorId(
        dataSources,
        authentication,
        { identifier: "linear" },
      );

      const linearBotHasPermission = await dataSources.graphApi
        .checkWebPermission(linearBotAccountId, webAccountId, "create_entity")
        .then((resp) => resp.data.has_permission);

      if (!linearBotHasPermission) {
        const webMachineActorId = await getWebMachineActorId(
          dataSources,
          authentication,
          {
            ownedById: webAccountId as OwnedById,
          },
        );

        await dataSources.graphApi.modifyWebAuthorizationRelationships(
          webMachineActorId,
          [
            {
              operation: "create",
              resource: webAccountId,
              relationAndSubject: {
                subject: {
                  kind: "account",
                  subjectId: linearBotAccountId,
                },
                relation: "entityCreator",
              },
            },
            {
              operation: "create",
              resource: webAccountId,
              relationAndSubject: {
                subject: {
                  kind: "account",
                  subjectId: linearBotAccountId,
                },
                relation: "entityEditor",
              },
            },
          ],
        );
      }

      return Promise.all([
        linearClient.triggerWorkspaceSync({
          authentication: { actorId: linearBotAccountId },
          workspaceOwnedById,
          teamIds: linearTeamIds,
        }),
        linkIntegrationToWorkspace(impureGraphContext, authentication, {
          linearIntegrationEntityId,
          workspaceEntityId,
          linearTeamIds,
        }),
      ]);
    }),
  ]);

  return linearIntegration.entity;
};
