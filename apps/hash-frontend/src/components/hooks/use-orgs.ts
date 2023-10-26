import { ApolloQueryResult, useQuery } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-graphql-shared/graphql/types";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { queryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import {
  constructMinimalOrg,
  isEntityOrgEntity,
  MinimalOrg,
} from "../../lib/user-and-org";
import { entityHasEntityTypeByVersionedUrlFilter } from "../../shared/filters";

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
              systemTypes.entityType.org.entityTypeId,
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

  const orgs = useMemo(() => {
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
  }, [subgraphAndPermissions]);

  return {
    loading,
    orgs,
    refetch,
  };
};
