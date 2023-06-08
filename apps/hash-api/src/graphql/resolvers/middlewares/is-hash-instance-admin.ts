import { ForbiddenError } from "apollo-server-express";

import { isUserHashInstanceAdmin } from "../../../graph/knowledge/system-types/user";
import { LoggedInGraphQLContext } from "../../context";
import { dataSourcesToImpureGraphContext } from "../util";
import { ResolverMiddleware } from "./middleware-types";

export const isHashInstanceAdminMiddleware: ResolverMiddleware<
  LoggedInGraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => async (obj, args, ctx, info) => {
  const context = dataSourcesToImpureGraphContext(ctx.dataSources);

  if (!(await isUserHashInstanceAdmin(context, { user: ctx.user }))) {
    throw new ForbiddenError(
      "You must be a HASH instance admin to perform this action.",
    );
  }
  return next(obj, args, ctx, info);
};
