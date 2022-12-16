import { ForbiddenError } from "apollo-server-express";
import { Scalars } from "./index/auth/model/aggregation.model/apiTypes.gen";
import {
  GraphQLContext,
  LoggedInGraphQLContext,
} from "./index/createApolloServer/resolvers/embed/context";
import { loggedInAndSignedUp } from "./index/createApolloServer/resolvers/loggedInAndSignedUp";
import { ResolverMiddleware } from "./index/createApolloServer/resolvers/loggedIn/middlewareTypes";

/** Middleware verifying the current logged in user has access to the requested account.
 * This middleware needs to be run on a query that is passing an
 * account id
 */
export const canAccessAccount: ResolverMiddleware<
  GraphQLContext,
  {
    ownedById: Scalars["OwnedById"];
  },
  LoggedInGraphQLContext
> = (next) =>
  loggedInAndSignedUp(async (_, args, ctx, info) => {
    const {
      userModel,
      dataSources: { graphApi },
    } = ctx;
    let isAllowed = false;
    if (userModel.getEntityUuid() === args.ownedById) {
      isAllowed = true;
    } else {
      isAllowed = await userModel.isMemberOfOrg(graphApi, {
        orgEntityUuid: args.ownedById,
      });
    }
    if (!isAllowed) {
      throw new ForbiddenError(
        `You cannot perform this action as you don't have permission to access the account with accountId ${args.accountId}`,
      );
    }
    return next(_, args, ctx, info);
  });
