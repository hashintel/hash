import { GraphQLContext, LoggedInGraphQLContext } from "./embed/context";
import { loggedInAndSignedUp } from "./loggedInAndSignedUp";
import { ResolverMiddleware } from "./loggedIn/middlewareTypes";
import { isHashInstanceAdmin } from "./loggedInAndSignedUpHashInstanceAdmin/isHashInstanceAdmin";

export const loggedInAndSignedUpHashInstanceAdmin: ResolverMiddleware<
  GraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => (obj: any, args: any, ctx: GraphQLContext, info: any) =>
  loggedInAndSignedUp(isHashInstanceAdmin(next))(obj, args, ctx, info);
