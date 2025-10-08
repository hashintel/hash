import { useQuery } from "@apollo/client";
import { convertBpFilterToGraphFilter } from "@local/hash-graph-sdk/filter";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import type { MinimalUser } from "../../lib/user-and-org";
import {
  constructMinimalUser,
  isEntityUserEntity,
} from "../../lib/user-and-org";
import { entityHasEntityTypeByVersionedUrlFilter } from "../../shared/filters";
import { useMemoCompare } from "../../shared/use-memo-compare";

export const useUsers = (): {
  loading: boolean;
  refetch: () => void;
  users?: MinimalUser[];
} => {
  const { data, loading, refetch } = useQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    variables: {
      request: {
        filter: convertBpFilterToGraphFilter({
          filters: [
            entityHasEntityTypeByVersionedUrlFilter(
              systemEntityTypes.user.entityTypeId,
            ),
          ],
          operator: "AND",
        }),
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    },
    fetchPolicy: "cache-and-network",
  });

  const { queryEntities } = data ?? {};

  const users = useMemoCompare(
    () => {
      if (!queryEntities) {
        return undefined;
      }

      return queryEntities.entities.map((userEntity) => {
        if (!isEntityUserEntity(userEntity)) {
          throw new Error(
            `Entity with type(s) ${userEntity.metadata.entityTypeIds.join(", ")} is not a user entity`,
          );
        }

        return constructMinimalUser({ userEntity });
      });
    },
    [queryEntities],
    /**
     * Check if the previous and new users are the same.
     * If they are, the return value from the hook won't change, avoiding unnecessary re-renders.
     *
     * This assumes that the UX/performance benefit of avoiding re-renders outweighs the cost of the comparison.
     *
     * An alternative approach would be to not use a 'cache-and-network' fetch policy, which also makes a network
     * request for all the users every time the hook is run, but instead use polling (or a subscription) to get
     * updates.
     *
     * An identical approach is taken in {@link useOrgs}. Update that too if this is changed.
     */
    (a, b) => {
      if (a === undefined || b === undefined) {
        return false;
      }

      if (a.length !== b.length) {
        return false;
      }

      return (
        a
          .map(
            ({ entity }) =>
              `${entity.metadata.recordId.entityId}${entity.metadata.recordId.editionId}`,
          )
          .sort()
          .join(",") ===
        b
          .map(
            ({ entity }) =>
              `${entity.metadata.recordId.entityId}${entity.metadata.recordId.editionId}`,
          )
          .sort()
          .join(",")
      );
    },
  );

  return {
    loading,
    refetch,
    users,
  };
};
