import { useApolloClient } from "@apollo/client";
import { AxiosError } from "axios";

import { resetLocalStorage } from "../../lib/config";
import { useAuthInfo } from "../../pages/shared/auth-info-context";
import { oryKratosClient } from "../../pages/shared/ory-kratos";

export const useLogoutFlow = () => {
  const client = useApolloClient();

  const { refetch: refetchUser } = useAuthInfo();

  return {
    logout: async () => {
      try {
        const logoutToken = await oryKratosClient
          .createBrowserLogoutFlow()
          .then(({ data }) => data.logout_token);

        await oryKratosClient.updateLogoutFlow({ token: logoutToken });

        await refetchUser();

        resetLocalStorage();

        await client.clearStore();
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 401) {
          // do nothing, the user is not logged in
        }
        throw err;
      }
    },
  };
};
