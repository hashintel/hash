import type { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { loggedInMiddleware } from "./logged-in";
import type { ResolverMiddleware } from "./middleware-types";
import { signedUpMiddleware } from "./signed-up";

export const loggedInAndSignedUpMiddleware: ResolverMiddleware<
  GraphQLContext,
  Record<string, unknown>,
  LoggedInGraphQLContext
> = (next) => (obj, args, ctx: GraphQLContext, info) =>
  loggedInMiddleware(signedUpMiddleware(next))(obj, args, ctx, info);
