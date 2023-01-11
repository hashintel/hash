import { useApolloClient } from "@apollo/client";
import { AxiosError } from "axios";
import { DependencyList, useEffect, useState } from "react";

import { resetLocalStorage } from "../../lib/config";
import { oryKratosClient } from "../../pages/shared/ory-kratos";

export const useLogoutFlow = (deps?: DependencyList) => {
  const client = useApolloClient();

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

        resetLocalStorage();

        await client.resetStore();
      }
    },
  };
};
