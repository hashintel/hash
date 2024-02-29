import { extractBaseUrl } from "@blockprotocol/type-system";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  googleEntityTypes,
  googlePropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { GoogleAccountProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { AccountId, Entity } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/src/stdlib/subgraph/roots";

import { ImpureGraphFunction } from "../../../graph/context-types";
import { getEntities } from "../../../graph/knowledge/primitive/entity";

/**
 * Get a linear integration by the linear org ID
 */
export const getGoogleAccountById: ImpureGraphFunction<
  { userAccountId: AccountId; googleAccountId: string },
  Promise<Entity<GoogleAccountProperties> | null>
> = async (context, authentication, params) => {
  const { userAccountId, googleAccountId } = params;
  const entities = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          {
            equal: [{ path: ["ownedById"] }, { parameter: userAccountId }],
          },
          generateVersionedUrlMatchingFilter(
            googleEntityTypes.account.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  extractBaseUrl(googlePropertyTypes.accountId.propertyTypeId),
                ],
              },
              { parameter: googleAccountId },
            ],
          },
        ],
      },
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    },
  }).then((subgraph) => {
    return getRoots(subgraph);
  });

  if (entities.length > 1) {
    throw new Error(
      `More than one Google Account with id ${googleAccountId} found for user ${userAccountId}`,
    );
  }

  const entity = entities[0];

  return entity ?? null;
};
