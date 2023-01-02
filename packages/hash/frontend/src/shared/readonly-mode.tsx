import { useRouter } from "next/router";

import { useAuthInfo } from "../pages/shared/auth-info-context";

export const useIsReadonlyMode = () => {
  const router = useRouter();
  const { authenticatedUser } = useAuthInfo();

  const isReadonlyMode = "readonly" in router.query || !authenticatedUser;

  return isReadonlyMode;
};
