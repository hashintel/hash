import { ForbiddenError } from "apollo-server-express";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { ResolverMiddleware } from "./middlewareTypes";

export const loggedIn: ResolverMiddleware<
  GraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => (obj: any, args: any, ctx: GraphQLContext, info: any) => {
  if (!ctx.user) {
    throw new ForbiddenError("You must be logged in to perform this action.");
  }
  return next(obj, args, ctx as LoggedInGraphQLContext, info);
};
