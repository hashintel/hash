import {
  ApolloClient,
  ApolloError,
  NormalizedCache,
  NormalizedCacheObject,
  useQuery,
} from "@apollo/client";
import { meQuery } from "../../graphql/queries/user.queries";
import { MeQuery, MeQueryVariables } from "../../graphql/apiTypes.gen";
import React from "react";

/**
 * Returns an object containing:
 *
 * user: the authenticated user (if any)
 *
 * refetch: a function to refetch the user from the API (ApolloClient will update the cache with the return)
 *
 * loading: a boolean to check if the api call is still loading
 */
export const useFetchUser = (
  apolloClient?: ApolloClient<NormalizedCacheObject>
) => {
  const { data, refetch, loading } = useQuery<MeQuery, MeQueryVariables>(
    meQuery,
    {
      onError: ({ graphQLErrors }) =>
        graphQLErrors.map((graphQLError) => {
          if (graphQLError.extensions?.code !== "FORBIDDEN") {
            throw new ApolloError({ graphQLErrors });
          }
        }),
      ...(apolloClient ? { client: apolloClient } : {}),
    }
  );

  const user = data?.me;

  return { user, refetch, loading };
};
