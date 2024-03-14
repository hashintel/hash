import type { OwnedById } from "@local/hash-subgraph";
import { useRouter } from "next/router";

import type { User } from "../lib/user-and-org";
import { useAuthInfo } from "../pages/shared/auth-info-context";

/** @todo check permissions via API, don't assume these rules hold true */
export const canUserEditType = (resourceOwnerId: OwnedById, user: User) =>
  resourceOwnerId === user.accountId ||
  user.memberOf.find(({ org }) => resourceOwnerId === org.accountGroupId);

export const useIsReadonlyModeForApp = () => {
  const router = useRouter();
  const { authenticatedUser } = useAuthInfo();

  const isReadonlyMode =
    "readonly" in router.query || !authenticatedUser?.accountSignupComplete;

  return isReadonlyMode;
};
