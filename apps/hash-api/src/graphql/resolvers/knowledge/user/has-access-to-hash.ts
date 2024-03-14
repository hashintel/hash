import { userHasAccessToHash } from "../../../../shared/user-has-access-to-hash";
import type { Query, ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";

export const hasAccessToHashResolver: ResolverFn<
  Query["hasAccessToHash"],
  Record<string, never>,
  LoggedInGraphQLContext,
  Record<string, never>
> = async (_, __, { user }) => userHasAccessToHash({ user });
