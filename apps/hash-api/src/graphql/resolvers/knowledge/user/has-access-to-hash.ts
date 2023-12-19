import { Query, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { userHasAccessToHash } from "../../shared/user-has-access-to-hash";

export const hasAccessToHashResolver: ResolverFn<
  Query["hasAccessToHash"],
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { user }) => userHasAccessToHash({ user });
