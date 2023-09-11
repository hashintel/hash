import { AccountGroupId, AccountId } from "@local/hash-subgraph";
import { useRouter } from "next/router";

import { AuthenticatedUser } from "../lib/user-and-org";
import { useAuthInfo } from "../pages/shared/auth-info-context";

export const canUserEditResource = (
  resourceAccountId: AccountId | AccountGroupId,
  user: AuthenticatedUser,
) =>
  resourceAccountId === user.accountId ||
  user.memberOf.find((org) => resourceAccountId === org.accountGroupId);

export const useIsReadonlyModeForApp = () => {
  const router = useRouter();
  const { authenticatedUser } = useAuthInfo();

  const isReadonlyMode =
    "readonly" in router.query || !authenticatedUser?.accountSignupComplete;

  return isReadonlyMode;
};

export const useIsReadonlyModeForResource = (resourceAccountId?: AccountId) => {
  const { authenticatedUser } = useAuthInfo();

  const appIsReadOnly = useIsReadonlyModeForApp();

  if (!authenticatedUser?.accountSignupComplete) {
    return true;
  }

  return (
    appIsReadOnly || !canUserEditResource(resourceAccountId, authenticatedUser)
  );
};
