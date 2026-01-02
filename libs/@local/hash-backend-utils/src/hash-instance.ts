import {
  type ActorEntityUuid,
  extractBaseUrl,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { type HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  HASHInstance,
  HASHInstance as HASHInstanceEntity,
  HASHInstanceProperties,
} from "@local/hash-isomorphic-utils/system-types/hashinstance";
import { backOff } from "exponential-backoff";

import { EntityTypeMismatchError, NotFoundError } from "./error.js";

export type HashInstance = {
  entity: HashEntity<HASHInstance>;
} & SimpleProperties<HASHInstanceProperties>;

export const getHashInstanceFromEntity = ({
  entity,
}: {
  entity: HashEntity<HASHInstanceEntity>;
}): HashInstance => {
  if (
    !entity.metadata.entityTypeIds.some(
      (entityTypeId) =>
        extractBaseUrl(entityTypeId) ===
        systemEntityTypes.hashInstance.entityTypeBaseUrl,
    )
  ) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.hashInstance.entityTypeId,
      entity.metadata.entityTypeIds,
    );
  }

  return {
    ...simplifyProperties(entity.properties),
    entity,
  };
};

/**
 * Get the hash instance.
 */
export const getHashInstance = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: ActorEntityUuid },
): Promise<HashInstance> => {
  const { entities } = await backOff(
    () =>
      queryEntities<HASHInstanceEntity>(context, authentication, {
        filter: {
          equal: [
            { path: ["type", "baseUrl"] },
            { parameter: systemEntityTypes.hashInstance.entityTypeBaseUrl },
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      }),
    {
      numOfAttempts: 3,
      startingDelay: 1_000,
      jitter: "full",
    },
  );

  if (entities.length > 1) {
    throw new Error("More than one hash instance entity found in the graph.");
  }

  const entity = entities[0];

  if (!entity) {
    throw new NotFoundError("Could not find hash instance entity.");
  }

  return getHashInstanceFromEntity({ entity });
};
