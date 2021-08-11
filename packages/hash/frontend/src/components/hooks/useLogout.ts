import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";

import { LogoutMutation } from "../../graphql/apiTypes.gen";
import { logout } from "../../graphql/queries/user.queries";

export const useLogout = () => {
  const router = useRouter();
  const [logoutFn, { loading, error }] = useMutation<LogoutMutation>(logout, {
    onCompleted: () => {
      void router.push("/");
    },
  });

  return {
    logout: logoutFn,
    loading,
    error,
  };
};
