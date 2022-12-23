import { ForbiddenError } from "apollo-server-express";

import { isUserHashInstanceAdmin } from "../../../graph/knowledge/system-types/user";
import { LoggedInGraphQLContext } from "../../context";
import { ResolverMiddleware } from "./middleware-types";

export const isHashInstanceAdminMiddleware: ResolverMiddleware<
  LoggedInGraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => async (obj, args, ctx, info) => {
  const {
    dataSources: { graphApi },
  } = ctx;

  if (!(await isUserHashInstanceAdmin({ graphApi }, { user: ctx.user }))) {
    throw new ForbiddenError(
      "You must be a HASH instance admin to perform this action.",
    );
  }
  return next(obj, args, ctx, info);
};
