import { ForbiddenError } from "apollo-server-express";

import type { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import type { ResolverMiddleware } from "./middleware-types";

export const loggedInMiddleware: ResolverMiddleware<
  GraphQLContext,
  Record<string, unknown>,
  LoggedInGraphQLContext
> = (next) => (obj, args, ctx, info) => {
  if (!ctx.user) {
    throw new ForbiddenError("You must be logged in to perform this action.");
  }
  return next(obj, args, ctx as LoggedInGraphQLContext, info);
};
