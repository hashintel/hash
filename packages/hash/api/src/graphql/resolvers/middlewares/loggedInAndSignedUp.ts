import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { loggedIn } from "./loggedIn";
import { ResolverMiddleware } from "./middlewareTypes";
import { signedUp } from "./signedUp";

export const loggedInAndSignedUp: ResolverMiddleware<
  GraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => (obj: any, args: any, ctx: GraphQLContext, info: any) =>
  loggedIn(signedUp(next))(obj, args, ctx, info);
