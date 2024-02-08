import { useApolloClient } from "@apollo/client";
import { AxiosError } from "axios";
import { useRouter } from "next/router";

import { resetLocalStorage } from "../../lib/config";
import { useAuthInfo } from "../../pages/shared/auth-info-context";
import { oryKratosClient } from "../../pages/shared/ory-kratos";

export const useLogoutFlow = () => {
  const router = useRouter();

  const client = useApolloClient();

  const { refetch: refetchUser } = useAuthInfo();

  return {
    logout: async () => {
      try {
        const logoutToken = await oryKratosClient
          .createBrowserLogoutFlow()
          .then(({ data }) => data.logout_token);

        await oryKratosClient.updateLogoutFlow({ token: logoutToken });

        /**
         * @todo: verify that the page is publicly viewable when pages aren't
         * publicly viewable by default
         */
        const isPubliclyViewablePage =
          router.pathname === "/[shortname]/[page-slug]";

        if (!isPubliclyViewablePage) {
          /**
           * Await redirect to prevent runtime errors in the `useAuthenticatedUser`
           * hook on the current page.
           */
          await router.push({
            pathname: "/signin",
            query: { return_to: router.asPath },
          });
        }

        resetLocalStorage();

        await client.clearStore();

        await refetchUser();
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 401) {
          // do nothing, the user is not logged in
        }
        throw err;
      }
    },
  };
};
