import { type EntityId, splitEntityId } from "@blockprotocol/type-system";
import { type HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { graphApiClient } from "../../shared/graph-api-client.js";

import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";

/**
 * The entity an entity ID names, if it isn't archived and the actor can read it: the draft for an entity ID with a
 * draft ID, otherwise the live entity. Also gives whether the actor can edit it.
 */
export const findEntity = async (
  authentication: AuthenticationContext,
  entityId: EntityId,
): Promise<{ entity: HashEntity; canEdit: boolean } | null> => {
  const [webId, entityUuid, draftId] = splitEntityId(entityId);

  const {
    entities: [entity],
    permissions,
  } = await queryEntities({ graphApi: graphApiClient }, authentication, {
    filter: {
      all: [
        { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
        { equal: [{ path: ["webId"] }, { parameter: webId }] },
        draftId
          ? { equal: [{ path: ["draftId"] }, { parameter: draftId }] }
          : { not: { exists: { path: ["draftId"] } } },
        { equal: [{ path: ["archived"] }, { parameter: false }] },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    includeDrafts: !!draftId,
    includePermissions: true,
  });

  return entity
    ? { entity, canEdit: !!permissions?.[entity.entityId]?.update }
    : null;
};
