import { userHasAccessToHash } from "../../../../shared/user-has-access-to-hash.js";
import type { Query, ResolverFn } from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";

export const hasAccessToHashResolver: ResolverFn<
  Query["hasAccessToHash"],
  Record<string, never>,
  LoggedInGraphQLContext,
  Record<string, never>
> = async (_, __, { user }) => userHasAccessToHash({ user });
