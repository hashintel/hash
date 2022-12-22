import { ForbiddenError } from "apollo-server-express";

import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { ResolverMiddleware } from "./middleware-types";

export const loggedInMiddleware: ResolverMiddleware<
  GraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => (obj, args, ctx, info) => {
  if (!ctx.user) {
    throw new ForbiddenError("You must be logged in to perform this action.");
  }
  return next(obj, args, ctx as LoggedInGraphQLContext, info);
};
