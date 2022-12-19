import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { loggedInMiddleware } from "./loggedIn";
import { ResolverMiddleware } from "./middlewareTypes";
import { signedUpMiddleware } from "./signedUp";

export const loggedInAndSignedUpMiddleware: ResolverMiddleware<
  GraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => (obj: any, args: any, ctx: GraphQLContext, info: any) =>
  loggedInMiddleware(signedUpMiddleware(next))(obj, args, ctx, info);
