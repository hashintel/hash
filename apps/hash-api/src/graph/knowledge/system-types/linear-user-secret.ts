import type {
  ActorEntityUuid,
  Entity,
  EntityId,
  WebId,
} from "@blockprotocol/type-system";
import {
  extractWebIdFromEntityId,
  splitEntityId,
} from "@blockprotocol/type-system";
import {
  EntityTypeMismatchError,
  NotFoundError,
} from "@local/hash-backend-utils/error";
import type { VaultClient } from "@local/hash-backend-utils/vault";
import { queryEntities } from "@local/hash-graph-sdk/entity";
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
import type { LinearIntegration } from "@local/hash-isomorphic-utils/system-types/linearintegration";
import type { UserSecret } from "@local/hash-isomorphic-utils/system-types/shared";
import * as Sentry from "@sentry/node";

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
    !entity.metadata.entityTypeIds.includes(
      systemEntityTypes.userSecret.entityTypeId,
    )
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.userSecret.entityTypeId,
      entity.metadata.entityTypeIds,
    );
  }
}

function assertLinearIntegration(
  entity: Entity,
): asserts entity is Entity<LinearIntegration> {
  if (
    !entity.metadata.entityTypeIds.includes(
      systemEntityTypes.linearIntegration.entityTypeId,
    )
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.linearIntegration.entityTypeId,
      entity.metadata.entityTypeIds,
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
  {
    userAccountId: ActorEntityUuid;
    linearOrgId: string;
    includeDrafts?: boolean;
  },
  Promise<LinearUserSecret>
> = async (context, authentication, params) => {
  const { userAccountId, linearOrgId, includeDrafts = false } = params;

  const { entities } = await queryEntities(context, authentication, {
    filter: {
      all: [
        {
          equal: [{ path: ["webId"] }, { parameter: userAccountId as WebId }],
        },
        { equal: [{ path: ["archived"] }, { parameter: false }] },
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
    includePermissions: false,
  });

  if (entities.length > 1) {
    const warningMessage = `More than one linear user secret (${entities.length}) found for the user ${userAccountId} with the linear org ID ${linearOrgId}`;

    Sentry.captureMessage(warningMessage);
    // eslint-disable-next-line no-console
    console.warn(warningMessage);
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
 * Get a Linear user secret value by the HASH web it is associated with.
 * @todo there may be multiple Linear user secrets associated with a web – handle the following filters:
 *   - the Linear workspace the secret is associated with (there may be multiple synced to a HASH web)
 *   - the user that created the integration (multiple users may have created a relevant secret)
 */

export const getLinearSecretValueByHashWebEntityId: ImpureGraphFunction<
  {
    hashWebEntityId: EntityId;
    vaultClient: VaultClient;
    includeDrafts?: boolean;
  },
  Promise<string>
> = async (context, authentication, params) => {
  const { hashWebEntityId, vaultClient, includeDrafts = false } = params;
  const [webId, webUuid] = splitEntityId(hashWebEntityId);

  const { entities: linearIntegrationEntities } = await queryEntities(
    context,
    authentication,
    {
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
                parameter: webUuid,
              },
            ],
          },
          {
            equal: [
              { path: ["outgoingLinks", "rightEntity", "webId"] },
              {
                parameter: webId,
              },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
      includePermissions: false,
    },
  );

  const integrationEntity = linearIntegrationEntities[0];

  if (!integrationEntity) {
    throw new NotFoundError(
      `No Linear integration found for web ${hashWebEntityId}`,
    );
  }

  if (linearIntegrationEntities.length > 1) {
    throw new Error(
      `Multiple Linear integrations found for web ${hashWebEntityId}`,
    );
  }

  assertLinearIntegration(integrationEntity);
  const { linearOrgId } = simplifyProperties(integrationEntity.properties);

  const userAccountId = extractWebIdFromEntityId(
    integrationEntity.metadata.recordId.entityId,
  ) as ActorEntityUuid;

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
    userAccountId,
  });

  return secret.data.value;
};
