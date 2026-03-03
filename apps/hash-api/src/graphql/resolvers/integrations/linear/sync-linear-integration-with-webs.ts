import type {
  ActorEntityUuid,
  Entity,
  WebId,
} from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getMachineIdByIdentifier } from "@local/hash-backend-utils/machine-actors";
import { addActorGroupMember } from "@local/hash-graph-sdk/principal/actor-group";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getLatestEntityById } from "../../../../graph/knowledge/primitive/entity";
import {
  getLinearIntegrationById,
  getSyncedWebsForLinearIntegration,
  linkIntegrationToWeb,
} from "../../../../graph/knowledge/system-types/linear-integration-entity";
import { getLinearUserSecretByLinearOrgId } from "../../../../graph/knowledge/system-types/linear-user-secret";
import { Linear } from "../../../../integrations/linear";
import type {
  MutationSyncLinearIntegrationWithWebsArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const syncLinearIntegrationWithWebsMutation: ResolverFn<
  Promise<Entity>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationSyncLinearIntegrationWithWebsArgs
> = async (_, { linearIntegrationEntityId, syncWithWebs }, graphQLContext) => {
  const { authentication, provenance, temporal, vault } = graphQLContext;

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

  const userAccountId = extractWebIdFromEntityId(
    linearIntegration.entity.metadata.recordId.entityId,
  ) as ActorEntityUuid;

  const linearUserSecret = await getLinearUserSecretByLinearOrgId(
    impureGraphContext,
    authentication,
    {
      userAccountId,
      linearOrgId: linearIntegration.linearOrgId,
    },
  );

  const vaultSecret = await vault.read<{ value: string }>({
    path: linearUserSecret.vaultPath,
    userAccountId,
  });

  const apiKey = vaultSecret.data.value;

  const linearClient = new Linear({
    temporalClient: temporal,
    apiKey,
  });

  const existingSyncedWebs = await getSyncedWebsForLinearIntegration(
    impureGraphContext,
    authentication,
    {
      linearIntegrationEntityId,
    },
  );

  const duplicateWorkspaceSyncsToRemove = existingSyncedWebs.filter(
    ({ webEntity }) =>
      !syncWithWebs.some(
        ({ webEntityId }) =>
          webEntity.metadata.recordId.entityId === webEntityId,
      ),
  );

  const linearBotAccountId = await getMachineIdByIdentifier(
    impureGraphContext,
    authentication,
    { identifier: "linear" },
  );

  if (!linearBotAccountId) {
    throw new NotFoundError("Failed to get linear bot");
  }

  await Promise.all([
    ...duplicateWorkspaceSyncsToRemove.map(
      async ({ syncLinearDataWithLinkEntity, webEntity }) => {
        if (
          webEntity.metadata.entityTypeIds.includes(
            systemEntityTypes.organization.entityTypeId,
          )
        ) {
          /** @todo: remove system account id as account group member if there are no other integrations */
        }

        return syncLinearDataWithLinkEntity.archive(
          impureGraphContext.graphApi,
          authentication,
          provenance,
        );
      },
    ),
    ...syncWithWebs.map(async ({ webEntityId, linearTeamIds }) => {
      const webId = extractEntityUuidFromEntityId(
        webEntityId,
      ) as string as WebId;

      const userOrOrganizationEntity = await getLatestEntityById(
        impureGraphContext,
        authentication,
        { entityId: webEntityId },
      );

      const webAccountId = extractEntityUuidFromEntityId(
        userOrOrganizationEntity.metadata.recordId.entityId,
      ) as WebId;

      await addActorGroupMember(impureGraphContext.graphApi, authentication, {
        actorId: linearBotAccountId,
        actorGroupId: webAccountId,
      });

      return Promise.all([
        linearClient.triggerWebSync({
          authentication: { actorId: linearBotAccountId },
          webId,
          teamIds: linearTeamIds,
        }),
        linkIntegrationToWeb(impureGraphContext, authentication, {
          linearIntegrationEntityId,
          webEntityId,
          linearTeamIds,
        }),
      ]);
    }),
  ]);

  return linearIntegration.entity;
};
