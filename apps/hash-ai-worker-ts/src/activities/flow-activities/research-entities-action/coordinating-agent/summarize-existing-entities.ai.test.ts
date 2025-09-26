import "../../../../shared/testing-utilities/mock-get-flow-context.js";

import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import { queryEntities } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { expect, test } from "vitest";

import { graphApiClient } from "../../../shared/graph-api-client.js";
import { summarizeExistingEntities } from "./summarize-existing-entities.js";

test.skip(
  "Test summarizeExistingEntities with user entities",
  async () => {
    const { entities: publicUserEntities } = await queryEntities(
      { graphApi: graphApiClient },
      { actorId: publicUserAccountId },
      {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.user.entityTypeId,
              { ignoreParents: true },
            ),
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    );

    const { existingEntitySummaries } = await summarizeExistingEntities({
      existingEntities: publicUserEntities,
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ existingEntitySummaries }));

    expect(existingEntitySummaries).toBeDefined();
    expect(existingEntitySummaries).toHaveLength(publicUserEntities.length);
  },
  {
    timeout: 5 * 60 * 1000,
  },
);
