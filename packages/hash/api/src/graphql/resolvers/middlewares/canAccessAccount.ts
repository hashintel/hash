import { ForbiddenError } from "apollo-server-express";
import { Scalars } from "../../apiTypes.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { loggedInAndSignedUp } from "./loggedInAndSignedUp";
import { ResolverMiddleware } from "./middlewareTypes";

/** Middleware verifying the current logged in user has access to the requested account.
 * This middleware needs to be run on a query that is passing an
 * account id
 */
export const canAccessAccount: ResolverMiddleware<
  GraphQLContext,
  {
    ownedById: Scalars["ID"];
  },
  LoggedInGraphQLContext
> = (next) =>
  loggedInAndSignedUp(async (_, args, ctx, info) => {
    const {
      userModel,
      dataSources: { graphApi },
    } = ctx;
    let isAllowed = false;
    if (userModel.entityId === args.ownedById) {
      isAllowed = true;
    } else {
      isAllowed = await userModel.isMemberOfOrg(graphApi, {
        orgEntityId: args.ownedById,
      });
    }
    if (!isAllowed) {
      throw new ForbiddenError(
        `You cannot perform this action as you don't have permission to access the account with accountId ${args.accountId}`,
      );
    }
    return next(_, args, ctx, info);
  });
