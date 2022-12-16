import { ForbiddenError } from "apollo-server-express";
import { GraphQLContext, LoggedInGraphQLContext } from "./embed/context";
import { ResolverMiddleware } from "./loggedIn/middlewareTypes";

export const loggedIn: ResolverMiddleware<
  GraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => (obj, args, ctx, info) => {
  if (!ctx.userModel) {
    throw new ForbiddenError("You must be logged in to perform this action.");
  }
  return next(obj, args, ctx as LoggedInGraphQLContext, info);
};
