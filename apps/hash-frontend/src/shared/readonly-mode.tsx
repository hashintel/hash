import { AccountId } from "@local/hash-subgraph";
import { useRouter } from "next/router";

import { AuthenticatedUser } from "../lib/user-and-org";
import { useAuthInfo } from "../pages/shared/auth-info-context";

const canUserEditResource = (
  resourceAccountId?: AccountId,
  user?: AuthenticatedUser,
) => {
  if (!resourceAccountId || !user) {
    return false;
  }

  return (
    resourceAccountId === user.accountId ||
    user.memberOf.find((org) => org.accountId === resourceAccountId)
  );
};

export const useIsReadonlyModeForApp = () => {
  const router = useRouter();
  const { authenticatedUser } = useAuthInfo();

  const isReadonlyMode = "readonly" in router.query || !authenticatedUser;

  return isReadonlyMode;
};

export const useIsReadonlyModeForResource = (resourceAccountId?: AccountId) => {
  const { authenticatedUser } = useAuthInfo();

  const appIsReadOnly = useIsReadonlyModeForApp();

  if (!authenticatedUser) {
    return false;
  }

  return (
    appIsReadOnly || !canUserEditResource(resourceAccountId, authenticatedUser)
  );
};
