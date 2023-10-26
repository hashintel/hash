import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  AccountId,
  Entity,
  EntityId,
  EntityRootType,
  extractOwnedByIdFromEntityId,
  OwnedById,
  splitEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { EntityTypeMismatchError, NotFoundError } from "../../../lib/error";
import { VaultClient } from "../../../vault";
import { SYSTEM_TYPES } from "../../system-types";
import { ImpureGraphFunction, PureGraphFunction } from "../../util";

export type LinearUserSecret = {
  connectionSourceName: string;
  vaultPath: string;
  entity: Entity;
};

export const getLinearUserSecretFromEntity: PureGraphFunction<
  { entity: Entity },
  LinearUserSecret
> = ({ entity }) => {
  if (
    entity.metadata.entityTypeId !==
    SYSTEM_TYPES.entityType.userSecret.schema.$id
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.userSecret.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const connectionSourceName = entity.properties[
    SYSTEM_TYPES.propertyType.connectionSourceName.metadata.recordId.baseUrl
  ] as string;

  const vaultPath = entity.properties[
    SYSTEM_TYPES.propertyType.vaultPath.metadata.recordId.baseUrl
  ] as string;

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
  { userAccountId: AccountId; linearOrgId: string },
  Promise<LinearUserSecret>
> = async ({ graphApi }, { actorId }, { userAccountId, linearOrgId }) => {
  const entities = await graphApi
    .getEntitiesByQuery(actorId, {
      filter: {
        all: [
          {
            equal: [
              { path: ["ownedById"] },
              { parameter: userAccountId as OwnedById },
            ],
          },
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.entityType.userSecret.schema.$id,
            { ignoreParents: true },
          ),
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.linkEntityType.usesUserSecret.schema.$id,
            { ignoreParents: true, pathPrefix: ["incomingLinks"] },
          ),
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.entityType.linearIntegration.schema.$id,
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
                  SYSTEM_TYPES.propertyType.linearOrgId.metadata.recordId
                    .baseUrl,
                ],
              },
              { parameter: linearOrgId },
            ],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then(({ data }) => getRoots(data as Subgraph<EntityRootType>));

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
  { hashWorkspaceEntityId: EntityId; vaultClient: VaultClient },
  Promise<string>
> = async (context, authentication, { hashWorkspaceEntityId, vaultClient }) => {
  const [workspaceOwnedById, workspaceUuid] = splitEntityId(
    hashWorkspaceEntityId,
  );

  const linearIntegrationEntities = await context.graphApi
    .getEntitiesByQuery(authentication.actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            SYSTEM_TYPES.linkEntityType.syncLinearDataWith.schema.$id,
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
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    })
    .then(({ data }) => getRoots(data as Subgraph<EntityRootType>));

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

  const secretEntity = await getLinearUserSecretByLinearOrgId(
    context,
    authentication,
    {
      linearOrgId: integrationEntity.properties[
        SYSTEM_TYPES.propertyType.linearOrgId.metadata.recordId.baseUrl
      ] as string,
      userAccountId: extractOwnedByIdFromEntityId(
        integrationEntity.metadata.recordId.entityId,
      ) as AccountId,
    },
  );

  const secret = await vaultClient.read({
    path: secretEntity.vaultPath,
    secretMountPath: "secret",
  });

  return secret.data.value;
};
