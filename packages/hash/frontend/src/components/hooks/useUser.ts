import { QueryHookOptions, useQuery } from "@apollo/client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { meQuery } from "../../graphql/queries/user.queries";
import { MeQuery } from "../../graphql/apiTypes.gen";

/**
 * Returns an object containing:
 *
 * user: the authenticated user (if any)
 *
 * refetch: a function to refetch the user from the API (ApolloClient will update the cache with the return)
 *
 * loading: a boolean to check if the api call is still loading
 */
export const useUser = (options?: Omit<QueryHookOptions, "errorPolicy">) => {
  const { data, refetch, loading } = useQuery<MeQuery>(meQuery, {
    ...options,
    errorPolicy: "all",
  });

  const user = data?.me;

  useEffect(() => {
    Sentry.configureScope((scope) => {
      const sentryUser = scope.getUser();
      if (!user && sentryUser) {
        scope.setUser(null);
      } else if (user && sentryUser?.id !== user.entityId) {
        const primaryEmail = user.properties.emails.find(
          (email) => email.primary,
        );
        Sentry.setUser({ id: user.entityId, email: primaryEmail?.address });
      }
    });
  }, [user]);

  /**
   * @todo add method to manually update user cache after
   * a query/mutation returns the updated User object.
   * This will help prevent having to call meQuery after every mutation
   */
  // const updateCache = () => {
  //   client.writeQuery();
  // };

  return { user, refetch, loading };
};
