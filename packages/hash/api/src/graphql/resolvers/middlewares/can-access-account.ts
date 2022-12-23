import { ForbiddenError } from "apollo-server-express";

import { isUserMemberOfOrg } from "../../../graph/knowledge/system-types/user";
import { Scalars } from "../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../context";
import { loggedInAndSignedUpMiddleware } from "./logged-in-and-signed-up";
import { ResolverMiddleware } from "./middleware-types";

/** Middleware verifying the current logged in user has access to the requested account.
 * This middleware needs to be run on a query that is passing an
 * account id
 */
export const canAccessAccountMiddleware: ResolverMiddleware<
  GraphQLContext,
  {
    ownedById: Scalars["OwnedById"];
  },
  LoggedInGraphQLContext
> = (next) =>
  loggedInAndSignedUpMiddleware(async (_, args, ctx, info) => {
    const {
      user,
      dataSources: { graphApi },
    } = ctx;
    let isAllowed = false;
    if (user.accountId === args.ownedById) {
      isAllowed = true;
    } else {
      isAllowed = await isUserMemberOfOrg(
        { graphApi },
        { user, orgEntityUuid: args.ownedById },
      );
    }
    if (!isAllowed) {
      throw new ForbiddenError(
        `You cannot perform this action as you don't have permission to access the account with accountId ${args.accountId}`,
      );
    }
    return next(_, args, ctx, info);
  });
