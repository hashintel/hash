import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { loggedInAndSignedUpMiddleware } from "./loggedInAndSignedUp";
import { ResolverMiddleware } from "./middlewareTypes";
import { isHashInstanceAdminMiddleware } from "./isHashInstanceAdmin";

export const loggedInAndSignedUpHashInstanceAdminMiddleware: ResolverMiddleware<
  GraphQLContext,
  any,
  LoggedInGraphQLContext
> = (next) => (obj: any, args: any, ctx: GraphQLContext, info: any) =>
  loggedInAndSignedUpMiddleware(isHashInstanceAdminMiddleware(next))(
    obj,
    args,
    ctx,
    info,
  );
