import { OwnedById } from "@local/hash-subgraph";
import { useRouter } from "next/router";

import { AuthenticatedUser } from "../lib/user-and-org";
import { useAuthInfo } from "../pages/shared/auth-info-context";

export const canUserEditResource = (
  resourceOwnerId: OwnedById,
  user: AuthenticatedUser,
) =>
  resourceOwnerId === user.accountId ||
  user.memberOf.find((org) => resourceOwnerId === org.accountGroupId);

export const useIsReadonlyModeForApp = () => {
  const router = useRouter();
  const { authenticatedUser } = useAuthInfo();

  const isReadonlyMode =
    "readonly" in router.query || !authenticatedUser?.accountSignupComplete;

  return isReadonlyMode;
};

export const useIsReadonlyModeForResource = (resourceOwnerId?: OwnedById) => {
  const { authenticatedUser } = useAuthInfo();

  const appIsReadOnly = useIsReadonlyModeForApp();

  if (!authenticatedUser?.accountSignupComplete) {
    return true;
  }

  return (
    !resourceOwnerId ||
    appIsReadOnly ||
    !canUserEditResource(resourceOwnerId, authenticatedUser)
  );
};
