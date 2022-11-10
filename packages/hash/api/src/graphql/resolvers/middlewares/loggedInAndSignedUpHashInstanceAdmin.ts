import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { loggedInAndSignedUp } from "./loggedInAndSignedUp";
import { ResolverMiddleware } from "./middlewareTypes";
import { isHashInstanceAdmin } from "./isHashInstanceAdmin";

export const loggedInAndSignedUpHashInstanceAdmin: ResolverMiddleware<
  GraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => (obj: any, args: any, ctx: GraphQLContext, info: any) =>
  loggedInAndSignedUp(isHashInstanceAdmin(next))(obj, args, ctx, info);
