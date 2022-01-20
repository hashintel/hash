import { Resolver, LogoutResponse } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";

export const logout: Resolver<
  LogoutResponse,
  {},
  LoggedInGraphQLContext
> = async (_, __, { passport }) => {
  passport.logout();

  return LogoutResponse.Success;
};
