import type { Query, ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";

/**
 * The session's own account, from the user hash-api resolved for the request,
 * so answering it costs no graph query.
 */
export const sessionAccountResolver: ResolverFn<
  Query["sessionAccount"],
  Record<string, never>,
  LoggedInGraphQLContext,
  Record<string, never>
> = (_, __, { user }) => ({
  webId: user.accountId,
  accountSignupComplete: user.isAccountSignupComplete,
});
