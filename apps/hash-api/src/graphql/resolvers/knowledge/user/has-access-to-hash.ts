import { userHasAccessToHash } from "../../../../shared/user-has-access-to-hash";
import { Query, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";

export const hasAccessToHashResolver: ResolverFn<
  Query["hasAccessToHash"],
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { user }) => userHasAccessToHash({ user });
