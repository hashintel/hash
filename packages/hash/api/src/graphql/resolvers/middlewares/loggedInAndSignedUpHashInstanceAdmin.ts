import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { isHashInstanceAdminMiddleware } from "./isHashInstanceAdmin";
import { loggedInAndSignedUpMiddleware } from "./loggedInAndSignedUp";
import { ResolverMiddleware } from "./middlewareTypes";

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
