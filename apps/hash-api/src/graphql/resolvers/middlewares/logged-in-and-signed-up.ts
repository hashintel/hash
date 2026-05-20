import { loggedInMiddleware } from "./logged-in";
import { signedUpMiddleware } from "./signed-up";

import type { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import type { ResolverMiddleware } from "./middleware-types";

export const loggedInAndSignedUpMiddleware: ResolverMiddleware<
  GraphQLContext,
  Record<string, unknown>,
  LoggedInGraphQLContext
> = (next) => (obj, args, ctx: GraphQLContext, info) =>
  loggedInMiddleware(signedUpMiddleware(next))(obj, args, ctx, info);
