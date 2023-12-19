import { User } from "../graph/knowledge/system-types/user";

const userEmailAllowList = process.env.USER_EMAIL_ALLOW_LIST
  ? (JSON.parse(process.env.USER_EMAIL_ALLOW_LIST) as string[])
  : undefined;

/**
 * Whether or not the user has access to the HASH instance.
 *
 * @returns `true` if the user has an email that is in the allow list,
 * or if there is no allow list. Otherwise returns `false`.
 */
export const userHasAccessToHash = (params: { user: User }) =>
  userEmailAllowList
    ? params.user.emails.some((email) => userEmailAllowList.includes(email))
    : // Default to `true` if no allow list was provided in the environment variables.
      true;
