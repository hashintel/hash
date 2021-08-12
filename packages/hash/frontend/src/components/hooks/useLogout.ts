import { useApolloClient, useMutation } from "@apollo/client";
import { useRouter } from "next/router";

import { LogoutMutation } from "../../graphql/apiTypes.gen";
import { logout } from "../../graphql/queries/user.queries";

export const useLogout = () => {
  const router = useRouter();
  const client = useApolloClient();

  const [logoutFn, { loading, error }] = useMutation<LogoutMutation>(logout, {
    onCompleted: () => {
      client.cache.evict({ fieldName: "me" });
      client.cache.gc();
      void router.push("/");
    },
  });

  return {
    logout: logoutFn,
    loading,
    error,
  };
};
