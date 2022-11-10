import { ForbiddenError } from "apollo-server-express";
import { LoggedInGraphQLContext } from "../../context";
import { ResolverMiddleware } from "./middlewareTypes";

export const isHashInstanceAdmin: ResolverMiddleware<
  LoggedInGraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => async (obj, args, ctx, info) => {
  const {
    dataSources: { graphApi },
  } = ctx;

  if (!(await ctx.userModel.isHashInstanceAdmin(graphApi))) {
    throw new ForbiddenError(
      "You must be a HASH instance admin to perform this action.",
    );
  }
  return next(obj, args, ctx, info);
};
