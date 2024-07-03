import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { AccountId } from "@local/hash-graph-types/account";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { graphApiClient } from "../../activities/shared/graph-api-client.js";

export const getAliceUserAccountId = async () => {
  const [aliceUserEntity] = await graphApiClient
    .getEntities(publicUserAccountId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.user.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  extractBaseUrl(systemPropertyTypes.shortname.propertyTypeId),
                ],
              },
              { parameter: "alice" },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity(entity, publicUserAccountId),
      ),
    );

  if (!aliceUserEntity) {
    throw new Error("Could not find a user entity with shortname 'alice'");
  }

  const aliceUserAccountId = extractOwnedByIdFromEntityId(
    aliceUserEntity.metadata.recordId.entityId,
  );

  return aliceUserAccountId as AccountId;
};
