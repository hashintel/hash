import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { loggedInMiddleware } from "./logged-in";
import { ResolverMiddleware } from "./middleware-types";
import { signedUpMiddleware } from "./signed-up";

export const loggedInAndSignedUpMiddleware: ResolverMiddleware<
  GraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => (obj: any, args: any, ctx: GraphQLContext, info: any) =>
  loggedInMiddleware(signedUpMiddleware(next))(obj, args, ctx, info);
