import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { googleEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { Account as GoogleAccount } from "@local/hash-isomorphic-utils/system-types/google/account";
import type { EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../../../../graphql/queries/knowledge/entity.queries";
import { useAuthenticatedUser } from "../../../auth-info-context";

interface UseGoogleAccountsResult {
  accounts: Entity<GoogleAccount>[];
  loading: boolean;
  refetch: () => void;
}

export const useGoogleAccounts = (): UseGoogleAccountsResult => {
  const { authenticatedUser } = useAuthenticatedUser();

  const { data, loading, refetch } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    variables: {
      includePermissions: false,
      request: {
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
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType<GoogleAccount>>(
          data.getEntitySubgraph.subgraph,
        )
      : undefined;

    const accounts = subgraph ? getRoots(subgraph) : [];

    return {
      accounts,
      loading,
      refetch,
    };
  }, [data, loading, refetch]);
};
