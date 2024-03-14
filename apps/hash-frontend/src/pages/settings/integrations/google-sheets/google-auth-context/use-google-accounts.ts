import { useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { googleEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { AccountProperties as GoogleAccountProperties } from "@local/hash-isomorphic-utils/system-types/googlesheetsintegration";
import type { Entity, EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useMemo } from "react";

import type {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../../../../graphql/queries/knowledge/entity.queries";
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";

type UseGoogleAccountsResult = {
  accounts: Entity<GoogleAccountProperties>[];
  loading: boolean;
  refetch: () => void;
};

export const useGoogleAccounts = (): UseGoogleAccountsResult => {
  const { authenticatedUser } = useAuthenticatedUser();

  const { data, loading, refetch } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: false,
      query: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              googleEntityTypes.account.entityTypeId,
              { ignoreParents: true },
            ),
            {
              equal: [
                { path: ["ownedById"] },
                { parameter: authenticatedUser.accountId },
              ],
            },
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    },
    skip: !authenticatedUser,
    fetchPolicy: "network-only",
  });

  return useMemo(() => {
    const subgraph = data
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
          data.structuralQueryEntities.subgraph,
        )
      : undefined;

    const accounts = subgraph
      ? (getRoots(subgraph) as Entity<GoogleAccountProperties>[])
      : [];

    return {
      accounts,
      loading,
      refetch,
    };
  }, [data, loading, refetch]);
};
