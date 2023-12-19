import { Query, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";

const userEmailAllowList = process.env.USER_EMAIL_ALLOW_LIST
  ? (JSON.parse(process.env.USER_EMAIL_ALLOW_LIST) as string[])
  : undefined;

export const hasAccessToHashResolver: ResolverFn<
  Query["hasAccessToHash"],
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { user }) =>
  userEmailAllowList
    ? user.emails.some((email) => userEmailAllowList.includes(email))
    : // Default to `true` if no allow list was provided
      true;
