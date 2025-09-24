import type { UserId } from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import { queryEntities } from "@local/hash-graph-sdk/entity";
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
  const {
    entities: [aliceUserEntity],
  } = await queryEntities(
    { graphApi: graphApiClient },
    { actorId: publicUserAccountId },
    {
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
    },
  );

  if (!aliceUserEntity) {
    throw new Error("Could not find a user entity with shortname 'alice'");
  }

  const aliceUserAccountId = extractWebIdFromEntityId(
    aliceUserEntity.metadata.recordId.entityId,
  );

  return aliceUserAccountId as UserId;
};
