import { ForbiddenError } from "apollo-server-express";
import { LoggedInGraphQLContext } from "../../context";
import { ResolverMiddleware } from "./middlewareTypes";

export const signedUp: ResolverMiddleware<LoggedInGraphQLContext, any> =
  (next) => (obj: any, args: any, ctx: LoggedInGraphQLContext, info: any) => {
    if (!ctx.user.isAccountSignupComplete()) {
      throw new ForbiddenError(
        "You must complete the sign-up process to perform this action.",
      );
    }
    return next(obj, args, ctx, info);
  };
