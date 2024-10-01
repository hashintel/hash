import type { ApolloQueryResult } from "@apollo/client";
import { useQuery } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import type {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import type { MinimalOrg } from "../../lib/user-and-org";
import { constructMinimalOrg, isEntityOrgEntity } from "../../lib/user-and-org";
import { entityHasEntityTypeByVersionedUrlFilter } from "../../shared/filters";
import { useMemoCompare } from "../../shared/use-memo-compare";

/**
 * Retrieves a list of organizations
 */
export const useOrgs = (): {
  loading: boolean;
  orgs?: MinimalOrg[];
  refetch: () => Promise<ApolloQueryResult<QueryEntitiesQuery>>;
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
              systemEntityTypes.organization.entityTypeId,
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
      hasLeftEntity: { incoming: 0, outgoing: 0 },
      hasRightEntity: { incoming: 0, outgoing: 0 },
    },
    fetchPolicy: "cache-and-network",
  });

  const { queryEntities: subgraphAndPermissions } = data ?? {};

  const orgs = useMemoCompare(
    () => {
      if (!subgraphAndPermissions) {
        return undefined;
      }

      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        subgraphAndPermissions.subgraph,
      );

      return getRoots(subgraph).map((orgEntity) => {
        if (!isEntityOrgEntity(orgEntity)) {
          throw new Error(
            `Entity with type ${orgEntity.metadata.entityTypeId} is not an org entity`,
          );
        }
        return constructMinimalOrg({ orgEntity });
      });
    },
    [subgraphAndPermissions],
    /**
     * Check if the previous and new orgs are the same.
     * If they are, the return value from the hook won't change, avoiding unnecessary re-renders.
     *
     * This assumes that the UX/performance benefit of avoiding re-renders outweighs the cost of the comparison.
     *
     * An alternative approach would be to not use a 'cache-and-network' fetch policy, which also makes a network request
     * for all the orgs every time the hook is run, but instead use polling (or a subscription) to get updates.
     *
     * An identical approach is taken in {@link useUsers}. Update that too if this is changed.
     */ (a, b) => {
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
    orgs,
    refetch,
  };
};
