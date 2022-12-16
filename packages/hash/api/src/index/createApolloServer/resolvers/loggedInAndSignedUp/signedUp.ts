import { ForbiddenError } from "apollo-server-express";
import { LoggedInGraphQLContext } from "../embed/context";
import { ResolverMiddleware } from "../loggedIn/middlewareTypes";

export const signedUp: ResolverMiddleware<LoggedInGraphQLContext, any> =
  (next) => (obj: any, args: any, ctx: LoggedInGraphQLContext, info: any) => {
    if (!ctx.userModel.isAccountSignupComplete()) {
      throw new ForbiddenError(
        "You must complete the sign-up process to perform this action.",
      );
    }
    return next(obj, args, ctx, info);
  };
