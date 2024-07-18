import {
  EntityTypeMismatchError,
  NotFoundError,
} from "@local/hash-backend-utils/error";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { LinearIntegration } from "@local/hash-isomorphic-utils/system-types/linearintegration";
import type { UserSecret } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  extractOwnedByIdFromEntityId,
  splitEntityId,
} from "@local/hash-subgraph";

import type {
  ImpureGraphFunction,
  PureGraphFunction,
} from "../../context-types";

export type LinearUserSecret = {
  connectionSourceName: string;
  vaultPath: string;
  entity: Entity<UserSecret>;
};

function assertLinearUserSecret(
  entity: Entity,
): asserts entity is Entity<UserSecret> {
  if (
    entity.metadata.entityTypeId !== systemEntityTypes.userSecret.entityTypeId
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.userSecret.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }
}

function assertLinearIntegration(
  entity: Entity,
): asserts entity is Entity<LinearIntegration> {
  if (
    entity.metadata.entityTypeId !==
    systemEntityTypes.linearIntegration.entityTypeId
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.linearIntegration.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }
}

export const getLinearUserSecretFromEntity: PureGraphFunction<
  { entity: Entity },
  LinearUserSecret
> = ({ entity }) => {
  assertLinearUserSecret(entity);

  const { connectionSourceName, vaultPath } = simplifyProperties(
    entity.properties,
  );

  return {
    connectionSourceName,
    vaultPath,
    entity,
  };
};

/**
 * Get a Linear user secret by the linear org ID
 */
export const getLinearUserSecretByLinearOrgId: ImpureGraphFunction<
  { userAccountId: AccountId; linearOrgId: string; includeDrafts?: boolean },
  Promise<LinearUserSecret>
> = async ({ graphApi }, { actorId }, params) => {
  const { userAccountId, linearOrgId, includeDrafts = false } = params;

  const entities = await graphApi
    .getEntities(actorId, {
      filter: {
        all: [
          {
            equal: [
              { path: ["ownedById"] },
              { parameter: userAccountId as OwnedById },
            ],
          },
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.userSecret.entityTypeId,
            { ignoreParents: true },
          ),
          generateVersionedUrlMatchingFilter(
            systemLinkEntityTypes.usesUserSecret.linkEntityTypeId,
            { ignoreParents: true, pathPrefix: ["incomingLinks"] },
          ),
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.linearIntegration.entityTypeId,
            {
              ignoreParents: true,
              pathPrefix: ["incomingLinks", "leftEntity"],
            },
          ),
          {
            equal: [
              {
                path: [
                  "incomingLinks",
                  "leftEntity",
                  "properties",
                  systemPropertyTypes.linearOrgId.propertyTypeBaseUrl,
                ],
              },
              { parameter: linearOrgId },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity(entity, actorId),
      ),
    );

  if (entities.length > 1) {
    throw new Error(
      `More than one linear user secret found for the user with the linear org ID ${linearOrgId}`,
    );
  }

  const entity = entities[0];

  if (!entity) {
    throw new NotFoundError(
      `Could not find a linear user secret for the user with the linear org ID ${linearOrgId}`,
    );
  }

  return getLinearUserSecretFromEntity({ entity });
};

/**
 * Get a Linear user secret value by the HASH workspace it is associated with.
 * @todo there may be multiple Linear user secrets associated with a workspace – handle the following filters:
 *   - the Linear workspace the secret is associated with (there may be multiple synced to a HASH workspace)
 *   - the user that created the integration (multiple users may have created a relevant secret)
 */

export const getLinearSecretValueByHashWorkspaceId: ImpureGraphFunction<
  {
    hashWorkspaceEntityId: EntityId;
    vaultClient: VaultClient;
    includeDrafts?: boolean;
  },
  Promise<string>
> = async (context, authentication, params) => {
  const { hashWorkspaceEntityId, vaultClient, includeDrafts = false } = params;
  const [workspaceOwnedById, workspaceUuid] = splitEntityId(
    hashWorkspaceEntityId,
  );

  const linearIntegrationEntities = await context.graphApi
    .getEntities(authentication.actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemLinkEntityTypes.syncLinearDataWith.linkEntityTypeId,
            {
              ignoreParents: true,
              pathPrefix: ["outgoingLinks"],
            },
          ),
          {
            equal: [
              { path: ["outgoingLinks", "rightEntity", "uuid"] },
              {
                parameter: workspaceUuid,
              },
            ],
          },
          {
            equal: [
              { path: ["outgoingLinks", "rightEntity", "ownedById"] },
              {
                parameter: workspaceOwnedById,
              },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity(entity, null, true),
      ),
    );

  const integrationEntity = linearIntegrationEntities[0];

  if (!integrationEntity) {
    throw new NotFoundError(
      `No Linear integration found for workspace ${hashWorkspaceEntityId}`,
    );
  }

  if (linearIntegrationEntities.length > 1) {
    throw new Error(
      `Multiple Linear integrations found for workspace ${hashWorkspaceEntityId}`,
    );
  }

  assertLinearIntegration(integrationEntity);
  const { linearOrgId } = simplifyProperties(integrationEntity.properties);

  const userAccountId = extractOwnedByIdFromEntityId(
    integrationEntity.metadata.recordId.entityId,
  ) as AccountId;

  const secretEntity = await getLinearUserSecretByLinearOrgId(
    context,
    authentication,
    {
      linearOrgId,
      userAccountId,
    },
  );

  const secret = await vaultClient.read<{ value: string }>({
    path: secretEntity.vaultPath,
    secretMountPath: "secret",
    userAccountId,
  });

  return secret.data.value;
};
