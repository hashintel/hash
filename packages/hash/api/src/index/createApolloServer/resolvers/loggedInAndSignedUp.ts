import { GraphQLContext, LoggedInGraphQLContext } from "./embed/context";
import { loggedIn } from "./loggedIn";
import { ResolverMiddleware } from "./loggedIn/middlewareTypes";
import { signedUp } from "./loggedInAndSignedUp/signedUp";

export const loggedInAndSignedUp: ResolverMiddleware<
  GraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => (obj: any, args: any, ctx: GraphQLContext, info: any) =>
  loggedIn(signedUp(next))(obj, args, ctx, info);
