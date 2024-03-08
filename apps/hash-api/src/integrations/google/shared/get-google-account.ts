import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { googleEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { AccountProperties as GoogleAccountProperties } from "@local/hash-isomorphic-utils/system-types/google/account";
import { AccountId, Entity } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import { ImpureGraphFunction } from "../../../graph/context-types";
import { getEntities } from "../../../graph/knowledge/primitive/entity";

/**
 * Get a Google Account entity by the account id in Google
 */
export const getGoogleAccountById: ImpureGraphFunction<
  { userAccountId: AccountId; googleAccountId: string },
  Promise<Entity<GoogleAccountProperties> | undefined>
> = async (context, authentication, params) => {
  const { userAccountId, googleAccountId } = params;
  const entities = await getEntities(context, authentication, {
    query: {
      filter: {
        all: [
          {
            equal: [{ path: ["ownedById"] }, { parameter: userAccountId }],
          },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
          generateVersionedUrlMatchingFilter(
            googleEntityTypes.account.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  "https://hash.ai/@google/types/property-type/account-id/",
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

  return entity as Entity<GoogleAccountProperties> | undefined;
};
