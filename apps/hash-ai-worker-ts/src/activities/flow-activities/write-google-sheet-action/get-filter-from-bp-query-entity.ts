import type { MultiFilter } from "@blockprotocol/graph";
import type { ActorEntityUuid, EntityId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { convertBpFilterToGraphFilter } from "@local/hash-graph-sdk/filter";
import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { Query } from "@local/hash-isomorphic-utils/system-types/blockprotocol/query";

import { getLatestEntityById } from "../shared/graph-requests.js";

export const getFilterFromBlockProtocolQueryEntity = async ({
  authentication,
  graphApiClient,
  queryEntityId,
}: {
  authentication: { actorId: ActorEntityUuid };
  graphApiClient: GraphApi;
  queryEntityId: EntityId;
}) => {
  let queryEntity: HashEntity<Query> | undefined;
  try {
    queryEntity = (await getLatestEntityById({
      graphApiClient,
      authentication,
      entityId: queryEntityId,
    })) as HashEntity<Query>;
  } catch {
    throw new Error(`No query entity found with id ${queryEntityId}.`);
  }

  const multiFilter =
    queryEntity.properties[
      "https://blockprotocol.org/@hash/types/property-type/query/"
    ];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- additional check in case another entity is used that has this optional
  if (!multiFilter) {
    throw new Error(
      `No ${blockProtocolPropertyTypes.query.propertyTypeBaseUrl} property found on query entity with id ${queryEntityId}`,
    );
  }

  return convertBpFilterToGraphFilter(multiFilter as MultiFilter);
};
