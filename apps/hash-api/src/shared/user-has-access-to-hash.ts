import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";

import type { ImpureGraphContext } from "../graph/context-types";
import {
  getUserPendingInvitations,
  type User,
} from "../graph/knowledge/system-types/user";

const userEmailAllowList = process.env.USER_EMAIL_ALLOW_LIST
  ? (JSON.parse(process.env.USER_EMAIL_ALLOW_LIST) as string[])
  : undefined;

/**
 * Whether or not the user has access to the HASH instance. They do if:
 * 1. There is no allow list for emails which have access, in which case everyone is allowed
 * 2. There is a list, and their email is on it
 * 3. They have completed account registration, and therefore must have been determined to have access in the past
 * 4. They have a pending invite to an organization – we allow users with access to invite other uses to have access.
 */
export const userHasAccessToHash = async (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  user: User,
) => {
  if (!userEmailAllowList) {
    return true;
  }

  if (user.isAccountSignupComplete) {
    /**
     * If the user has completed account registration, they are allowed access.
     */
    return true;
  }

  if (user.emails.some((email) => userEmailAllowList.includes(email))) {
    return true;
  }

  const pendingInvitations = await getUserPendingInvitations(
    context,
    authentication,
    { user },
  );

  return pendingInvitations.length > 0;
};
