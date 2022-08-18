import { LogoutResponse, ResolverFn } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";

export const logout: ResolverFn<
  LogoutResponse,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { passport }) => {
  passport.logout();

  return LogoutResponse.Success;
};
