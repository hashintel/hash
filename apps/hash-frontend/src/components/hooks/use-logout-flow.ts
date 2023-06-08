import { useApolloClient } from "@apollo/client";
import { AxiosError } from "axios";
import { DependencyList, useEffect, useState } from "react";

import { resetLocalStorage } from "../../lib/config";
import { useAuthInfo } from "../../pages/shared/auth-info-context";
import { oryKratosClient } from "../../pages/shared/ory-kratos";

export const useLogoutFlow = (deps?: DependencyList) => {
  const client = useApolloClient();

  const { refetch: refetchUser } = useAuthInfo();

  const [logoutToken, setLogoutToken] = useState<string>("");

  useEffect(() => {
    oryKratosClient
      .createBrowserLogoutFlow()
      .then(({ data }) => setLogoutToken(data.logout_token))
      .catch((err: AxiosError) => {
        switch (err.response?.status) {
          case 401:
            // do nothing, the user is not logged in
            return;
        }

        // Something else happened!
        return Promise.reject(err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    logout: async () => {
      if (logoutToken) {
        await oryKratosClient.updateLogoutFlow({ token: logoutToken });

        await refetchUser();

        resetLocalStorage();

        await client.clearStore();
      }
    },
  };
};
