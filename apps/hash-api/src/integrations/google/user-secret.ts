import { NotFoundError } from "@local/hash-backend-utils/error";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { AccountId, EntityRootType, OwnedById } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/src/shared/type-system-patch";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/src/stdlib/subgraph/roots";

import { ImpureGraphFunction } from "../../graph/context-types";
import {
  getLinearUserSecretFromEntity,
  LinearUserSecret,
} from "../../graph/knowledge/system-types/linear-user-secret";

/**
 * Get a Linear user secret by the linear org ID
 */
export const getLinearUserSecretByLinearOrgId: ImpureGraphFunction<
  { userAccountId: AccountId; linearOrgId: string; includeDrafts?: boolean },
  Promise<LinearUserSecret>
> = async ({ graphApi }, { actorId }, params) => {
  const { userAccountId, linearOrgId, includeDrafts = false } = params;

  const entities = await graphApi
    .getEntitiesByQuery(actorId, {
      query: {
        filter: {
          all: [
            {
              equal: [
                { path: ["ownedById"] },
                { parameter: userAccountId as OwnedById },
              ],
            },
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.userSecret.entityTypeId,
              { ignoreParents: true },
            ),
            generateVersionedUrlMatchingFilter(
              systemLinkEntityTypes.usesUserSecret.linkEntityTypeId,
              { ignoreParents: true, pathPrefix: ["incomingLinks"] },
            ),
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.linearIntegration.entityTypeId,
              {
                ignoreParents: true,
                pathPrefix: ["incomingLinks", "leftEntity"],
              },
            ),
            {
              equal: [
                {
                  path: [
                    "incomingLinks",
                    "leftEntity",
                    "properties",
                    extractBaseUrl(
                      systemPropertyTypes.linearOrgId.propertyTypeId,
                    ),
                  ],
                },
                { parameter: linearOrgId },
              ],
            },
          ],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts,
      },
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
        data.subgraph,
      );

      return getRoots(subgraph);
    });

  if (entities.length > 1) {
    throw new Error(
      `More than one linear user secret found for the user with the linear org ID ${linearOrgId}`,
    );
  }

  const entity = entities[0];

  if (!entity) {
    throw new NotFoundError(
      `Could not find a linear user secret for the user with the linear org ID ${linearOrgId}`,
    );
  }

  return getLinearUserSecretFromEntity({ entity });
};
