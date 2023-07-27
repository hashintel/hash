import {
  AccountId,
  Entity,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { EntityTypeMismatchError } from "../../../lib/error";
import {
  currentTimeInstantTemporalAxes,
  ImpureGraphFunction,
  PureGraphFunction,
  zeroedGraphResolveDepths,
} from "../..";
import { SYSTEM_TYPES } from "../../system-types";

export type LinearIntegration = {
  linearOrgId: string;
  entity: Entity;
};

export const getLinearIntegrationFromEntity: PureGraphFunction<
  { entity: Entity },
  LinearIntegration
> = ({ entity }) => {
  if (
    entity.metadata.entityTypeId !==
    SYSTEM_TYPES.entityType.linearIntegration.schema.$id
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      SYSTEM_TYPES.entityType.user.schema.$id,
      entity.metadata.entityTypeId,
    );
  }

  const linearOrgId = entity.properties[
    SYSTEM_TYPES.propertyType.linearOrgId.metadata.recordId.baseUrl
  ] as string;

  return {
    linearOrgId,
    entity,
  };
};

/**
 * Get a linear user secret by the linear org ID
 */
export const getLinearIntegrationByLinearOrgId: ImpureGraphFunction<
  { userAccountId: AccountId; linearOrgId: string },
  Promise<LinearIntegration | null>
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
                parameter: SYSTEM_TYPES.entityType.linearIntegration.schema.$id,
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
      `More than one linear integration found for the user with the linear org ID ${linearOrgId}`,
    );
  }

  const entity = entities[0];

  return entity ? getLinearIntegrationFromEntity({ entity }) : null;
};
