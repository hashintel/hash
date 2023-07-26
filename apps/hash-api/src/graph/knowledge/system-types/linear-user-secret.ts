import {
  AccountId,
  Entity,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { EntityTypeMismatchError, NotFoundError } from "../../../lib/error";
import {
  currentTimeInstantTemporalAxes,
  ImpureGraphFunction,
  PureGraphFunction,
  zeroedGraphResolveDepths,
} from "../..";
import { SYSTEM_TYPES } from "../../system-types";

export type LinearUserSecret = {
  connectionSourceName: string;
  vaultPath: string;
  linearOrgId: string;
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
      SYSTEM_TYPES.entityType.user.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const connectionSourceName = entity.properties[
    SYSTEM_TYPES.propertyType.connectionSourceName.metadata.recordId.baseUrl
  ] as string;

  const vaultPath = entity.properties[
    SYSTEM_TYPES.propertyType.vaultPath.metadata.recordId.baseUrl
  ] as string;

  const linearOrgId = entity.properties[
    SYSTEM_TYPES.propertyType.linearOrgId.metadata.recordId.baseUrl
  ] as string;

  return {
    connectionSourceName,
    vaultPath,
    linearOrgId,
  };
};

/**
 * Get a linear user secret by the linear org ID
 */
export const getLinearUserSecretByLinearOrgId: ImpureGraphFunction<
  { userAccountId: AccountId; linearOrgId: string },
  Promise<LinearUserSecret>
> = async ({ graphApi }, { userAccountId, linearOrgId }) => {
  const entities = await graphApi
    .getEntitiesByQuery({
      filter: {
        all: [
          {
            equal: [{ path: ["ownedById"] }, { parameter: userAccountId }],
          },
          {
            equal: [
              { path: ["type", "versionedUrl"] },
              {
                parameter: SYSTEM_TYPES.entityType.userSecret.schema.$id,
              },
            ],
          },
          {
            equal: [
              {
                path: [
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
