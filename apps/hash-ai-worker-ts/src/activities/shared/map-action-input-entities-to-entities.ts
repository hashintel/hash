import type { ActorEntityUuid, EntityId } from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import { HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import type {
  PersistedEntitiesMetadata,
  PersistedEntityMetadata,
} from "@local/hash-isomorphic-utils/flows/types";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

export const mapActionInputEntitiesToEntities = async (params: {
  actorId: ActorEntityUuid;
  graphApiClient: GraphApi;
  inputEntities:
    | SerializedEntity[]
    | PersistedEntityMetadata[]
    | PersistedEntitiesMetadata;
}): Promise<HashEntity[]> => {
  const { actorId, graphApiClient, inputEntities } = params;

  const entityIdsToFetch: EntityId[] = [];
  const directEntities: HashEntity[] = [];

  const inputEntitiesArray =
    "persistedEntities" in inputEntities
      ? inputEntities.persistedEntities
      : inputEntities;

  for (const inputEntity of inputEntitiesArray) {
    if ("operation" in inputEntity) {
      entityIdsToFetch.push(inputEntity.entityId);
    } else {
      // SerializedEntity - convert directly
      directEntities.push(new HashEntity(inputEntity));
    }
  }

  if (entityIdsToFetch.length === 0) {
    return directEntities;
  }

  const { entities: fetchedEntities } = await queryEntities(
    { graphApi: graphApiClient },
    { actorId },
    {
      filter: {
        any: entityIdsToFetch.map((entityId) => ({
          equal: [
            { path: ["uuid"] },
            { parameter: extractEntityUuidFromEntityId(entityId) },
          ],
        })),
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: true,
      includePermissions: false,
    },
  );

  return [...directEntities, ...fetchedEntities];
};
