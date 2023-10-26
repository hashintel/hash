import { ApolloQueryResult, useQuery } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-graphql-shared/graphql/types";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { AccountGroupId, EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { constructOrg, isEntityOrgEntity, Org } from "../../lib/user-and-org";

/**
 * Retrieves a specific set of organizations, with their avatars and members populated
 */
export const useOrgsWithLinks = ({
  orgAccountGroupIds,
}: {
  orgAccountGroupIds?: AccountGroupId[];
}): {
  loading: boolean;
  orgs?: Org[];
  refetch: () => Promise<ApolloQueryResult<StructuralQueryEntitiesQuery>>;
} => {
  const { data, loading, refetch } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: false,
      query: {
        filter: {
          all: [
            ...(orgAccountGroupIds
              ? [
                  {
                    any: orgAccountGroupIds.map((accountGroupId) => ({
                      equal: [
                        { path: ["uuid"] },
                        {
                          parameter: accountGroupId,
                        },
                      ],
                    })),
                  },
                ]
              : []),
            generateVersionedUrlMatchingFilter(
              types.entityType.org.entityTypeId,
              { ignoreParents: true },
            ),
          ],
        },
        graphResolveDepths: {
          constrainsValuesOn: { outgoing: 0 },
          constrainsPropertiesOn: { outgoing: 0 },
          constrainsLinksOn: { outgoing: 0 },
          constrainsLinkDestinationsOn: { outgoing: 0 },
          inheritsFrom: { outgoing: 0 },
          isOfType: { outgoing: 0 },
          // These depths are chosen to cover the following:
          // 1. the org's avatar (org -> [hasLeftEntity incoming 1] hasAvatar [hasRightEntity outgoing 1] -> avatar)
          // 2. the org's members (user <- [hasLeftEntity outgoing 1] orgMembership [hasRightEntity incoming 1] <- org)
          hasLeftEntity: { incoming: 1, outgoing: 1 },
          hasRightEntity: { incoming: 1, outgoing: 1 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
    fetchPolicy: "cache-and-network",
    skip: !orgAccountGroupIds || !orgAccountGroupIds.length,
  });

  const { structuralQueryEntities: subgraphAndPermissions } = data ?? {};

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
      return constructOrg({ subgraph, orgEntity });
    });
  }, [subgraphAndPermissions]);

  return {
    loading,
    orgs: orgAccountGroupIds && orgAccountGroupIds.length === 0 ? [] : orgs,
    refetch,
  };
};
