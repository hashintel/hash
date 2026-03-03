import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";

import type { ImpureGraphContext } from "../graph/context-types";
import {
  getUserPendingInvitations,
  type User,
} from "../graph/knowledge/system-types/user";

const isArrayOfStrings = (value: unknown): value is string[] => {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
};

let userEmailAllowList: string[] | undefined;
if (process.env.USER_EMAIL_ALLOW_LIST) {
  try {
    const uncheckedUserEmailAllowList = JSON.parse(
      process.env.USER_EMAIL_ALLOW_LIST,
    ) as unknown;

    if (!isArrayOfStrings(uncheckedUserEmailAllowList)) {
      throw new Error(
        `USER_EMAIL_ALLOW_LIST was not parsed to an array of strings. Raw value: ${process.env.USER_EMAIL_ALLOW_LIST}`,
      );
    }

    userEmailAllowList = uncheckedUserEmailAllowList;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Could not parse USER_EMAIL_ALLOW_LIST as JSON. Value: ${process.env.USER_EMAIL_ALLOW_LIST}`,
      );
    }
    throw error;
  }
}

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
  user: User | null,
) => {
  if (!user) {
    return false;
  }

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
