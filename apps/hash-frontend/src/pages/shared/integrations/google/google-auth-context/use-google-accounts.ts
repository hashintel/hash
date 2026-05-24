import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import {
  deserializeQueryEntitiesResponse,
  type HashEntity,
  type SerializedQueryEntitiesResponse,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { googleEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { queryEntitiesQuery } from "../../../../../graphql/queries/knowledge/entity.queries";
import { useAuthenticatedUser } from "../../../auth-info-context";

import type {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import type { Account as GoogleAccount } from "@local/hash-isomorphic-utils/system-types/google/account";

type UseGoogleAccountsResult = {
  accounts: HashEntity<GoogleAccount>[];
  loading: boolean;
  refetch: () => void;
};

export const useGoogleAccounts = (): UseGoogleAccountsResult => {
  const { authenticatedUser } = useAuthenticatedUser();

  const { data, loading, refetch } = useQuery<QueryEntitiesQuery, QueryEntitiesQueryVariables>(
    queryEntitiesQuery,
    {
      variables: {
        request: {
          filter: {
            all: [
              generateVersionedUrlMatchingFilter(googleEntityTypes.account.entityTypeId, {
                ignoreParents: true,
              }),
              {
                equal: [{ path: ["webId"] }, { parameter: authenticatedUser.accountId }],
              },
              { equal: [{ path: ["archived"] }, { parameter: false }] },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: false,
          includePermissions: false,
        },
      },
      skip: !authenticatedUser,
      fetchPolicy: "network-only",
    },
  );

  return useMemo(() => {
    const accounts = data
      ? deserializeQueryEntitiesResponse(
          data.queryEntities as SerializedQueryEntitiesResponse<GoogleAccount>,
        ).entities
      : [];

    return {
      accounts,
      loading,
      refetch,
    };
  }, [data, loading, refetch]);
};
