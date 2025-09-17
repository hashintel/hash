import type { UserId } from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import { mapGraphApiEntityToEntity } from "@local/hash-graph-sdk/subgraph";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

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

  const aliceUserAccountId = extractWebIdFromEntityId(
    aliceUserEntity.metadata.recordId.entityId,
  );

  return aliceUserAccountId as UserId;
};
