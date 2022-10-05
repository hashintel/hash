import { QueryHookOptions, useQuery } from "@apollo/client";
import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Session } from "@ory/client";
import { meQuery } from "../../graphql/queries/user.queries";
import { MeQuery, MeQueryVariables } from "../../graphql/apiTypes.gen";
import { oryKratosClient } from "../../pages/shared/ory-kratos";

/**
 * Returns an object containing:
 *
 * user: the authenticated user (if any)
 *
 * refetch: a function to refetch the user from the API (ApolloClient will update the cache with the return)
 *
 * loading: a boolean to check if the api call is still loading
 */
export const useUser = (
  options?: Omit<QueryHookOptions<MeQuery, MeQueryVariables>, "errorPolicy">,
  forceLogin = false,
) => {
  const {
    data: meQueryResponseData,
    refetch: refetchUser,
    loading: loadingUser,
  } = useQuery<MeQuery, MeQueryVariables>(meQuery, {
    ...options,
    errorPolicy: "all",
  });

  const { me: user } = meQueryResponseData || {};

  /** @todo: store this in a react context if we have a use for it long-term */
  const [kratosSession, setKratosSession] = useState<Session>();
  const [loadingKratosSession, setLoadingKratosSession] =
    useState<boolean>(true);

  useEffect(() => {
    Sentry.configureScope((scope) => {
      const sentryUser = scope.getUser();
      if (!user && sentryUser) {
        scope.setUser(null);
      } else if (user && sentryUser?.id !== user.entityId) {
        const primaryEmail = user.emails.find((email) => email.primary);
        Sentry.setUser({ id: user.entityId, email: primaryEmail?.address });
      }
    });
  }, [user]);

  const router = useRouter();

  const fetchKratosIdentity = async (login: boolean) => {
    setLoadingKratosSession(true);

    const session = await oryKratosClient
      .toSession()
      .then(({ data }) => data)
      .catch(() => undefined);

    if (!session && login) {
      await router.push("/login");
    } else {
      setKratosSession(session);
      setLoadingKratosSession(false);
    }
  };

  const fetchKratosIdentityRef = useRef(fetchKratosIdentity);
  useLayoutEffect(() => {
    fetchKratosIdentityRef.current = fetchKratosIdentity;
  });

  useEffect(() => {
    void fetchKratosIdentityRef.current(forceLogin);
  }, [forceLogin]);

  /**
   * @todo add method to manually update user cache after
   * a query/mutation returns the updated User object.
   * This will help prevent having to call meQuery after every mutation
   */
  // const updateCache = () => {
  //   client.writeQuery();
  // };

  return {
    user,
    kratosSession,
    refetch: () =>
      Promise.all([refetchUser(), fetchKratosIdentity(forceLogin)]),
    loading: loadingUser || loadingKratosSession,
  };
};

export const useLoggedInUser = (options?: Parameters<typeof useUser>[0]) => {
  return useUser(options, true);
};
