import type { GraphQLContext, LoggedInGraphQLContext } from "../../context.js";
import { loggedInMiddleware } from "./logged-in.js";
import type { ResolverMiddleware } from "./middleware-types.js";
import { signedUpMiddleware } from "./signed-up.js";

export const loggedInAndSignedUpMiddleware: ResolverMiddleware<
  GraphQLContext,
  Record<string, unknown>,
  LoggedInGraphQLContext
> = (next) => (obj, args, ctx: GraphQLContext, info) =>
  loggedInMiddleware(signedUpMiddleware(next))(obj, args, ctx, info);
