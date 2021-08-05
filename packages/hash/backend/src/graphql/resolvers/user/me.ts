import { Resolver, User } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";

export const me: Resolver<User, {}, LoggedInGraphQLContext> = async (
  _,
  __,
  { user }
) => user;
