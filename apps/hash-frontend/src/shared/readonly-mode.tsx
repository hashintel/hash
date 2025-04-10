import type { WebId } from "@blockprotocol/type-system";
import { useRouter } from "next/router";

import type { User } from "../lib/user-and-org";
import { useAuthInfo } from "../pages/shared/auth-info-context";

/** @todo check permissions via API, don't assume these rules hold true */
export const canUserEditType = (resourceOwnerId: WebId, user: User) =>
  resourceOwnerId === user.accountId ||
  user.memberOf.find(({ org }) => resourceOwnerId === org.webId);

export const useIsReadonlyModeForApp = () => {
  const router = useRouter();
  const { authenticatedUser } = useAuthInfo();

  const isReadonlyMode =
    "readonly" in router.query || !authenticatedUser?.accountSignupComplete;

  return isReadonlyMode;
};
