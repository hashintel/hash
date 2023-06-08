import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { isHashInstanceAdminMiddleware } from "./is-hash-instance-admin";
import { loggedInAndSignedUpMiddleware } from "./logged-in-and-signed-up";
import { ResolverMiddleware } from "./middleware-types";

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
