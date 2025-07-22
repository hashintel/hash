import { useQuery } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
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
      includePermissions: false,
      operation: {
        multiFilter: {
          filters: [
            entityHasEntityTypeByVersionedUrlFilter(
              systemEntityTypes.user.entityTypeId,
            ),
          ],
          operator: "AND",
        },
      },
      constrainsValuesOn: { outgoing: 0 },
      constrainsPropertiesOn: { outgoing: 0 },
      constrainsLinksOn: { outgoing: 0 },
      constrainsLinkDestinationsOn: { outgoing: 0 },
      inheritsFrom: { outgoing: 0 },
      isOfType: { outgoing: 0 },
      // as there may be a lot of users, we don't fetch anything linked to them (e.g. org memberships, avatars)
      // @todo don't fetch all users, fetch a sensible short list on load and others dynamically as needed
      hasLeftEntity: { incoming: 0, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 0 },
    },
    fetchPolicy: "cache-and-network",
  });

  const { queryEntities: queryEntitiesData } = data ?? {};

  const users = useMemoCompare(
    () => {
      if (!queryEntitiesData) {
        return undefined;
      }

      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<
        EntityRootType<HashEntity>
      >(queryEntitiesData.subgraph);

      return getRoots(subgraph).map((userEntity) => {
        if (!isEntityUserEntity(userEntity)) {
          throw new Error(
            `Entity with type(s) ${userEntity.metadata.entityTypeIds.join(", ")} is not a user entity`,
          );
        }

        return constructMinimalUser({ userEntity });
      });
    },
    [queryEntitiesData],
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
