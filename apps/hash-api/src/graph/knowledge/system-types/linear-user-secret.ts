import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { LinearIntegrationProperties } from "@local/hash-isomorphic-utils/system-types/linearintegration";
import { UserSecretProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountId,
  Entity,
  EntityId,
  EntityRootType,
  extractOwnedByIdFromEntityId,
  OwnedById,
  splitEntityId,
} from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { EntityTypeMismatchError, NotFoundError } from "../../../lib/error";
import { VaultClient } from "../../../vault";
import { ImpureGraphFunction, PureGraphFunction } from "../../context-types";

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
    systemTypes.entityType.userSecret.entityTypeId
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemTypes.entityType.userSecret.entityTypeId,
      entity.metadata.entityTypeId,
    );
  }

  const { connectionSourceName, vaultPath } = simplifyProperties(
    entity.properties as UserSecretProperties,
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
            systemTypes.entityType.userSecret.entityTypeId,
            { ignoreParents: true },
          ),
          generateVersionedUrlMatchingFilter(
            systemTypes.linkEntityType.usesUserSecret.linkEntityTypeId,
            { ignoreParents: true, pathPrefix: ["incomingLinks"] },
          ),
          generateVersionedUrlMatchingFilter(
            systemTypes.entityType.linearIntegration.entityTypeId,
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
                  extractBaseUrl(
                    systemTypes.propertyType.linearOrgId.propertyTypeId,
                  ),
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
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);

      return getRoots(subgraph);
    });

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
            systemTypes.linkEntityType.syncLinearDataWith.linkEntityTypeId,
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
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data);
      return getRoots(subgraph);
    });

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

  const { linearOrgId } = simplifyProperties(
    integrationEntity.properties as LinearIntegrationProperties,
  );

  const secretEntity = await getLinearUserSecretByLinearOrgId(
    context,
    authentication,
    {
      linearOrgId,
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
