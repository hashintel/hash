import { ApolloError, ForbiddenError } from "apollo-server-express";

import { Account, User } from "../../../model";
import { MutationUpdateUserArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityWithIncompleteEntityType } from "../../../model";

export const updateUser: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateUserArgs
> = async (_, { userEntityId, properties }, { dataSources, user }) =>
  dataSources.db.transaction(async (client) => {
    /** @todo: allow HASH admins to bypass this */

    if (userEntityId !== user.entityId) {
      throw new ForbiddenError("You can only update your own user properties");
    }

    const { shortname, preferredName } = properties;

    if (!shortname && !preferredName) {
      throw new ApolloError(
        "An updated shortname or preferredName must be provided to update a user",
        "NO_OP"
      );
    }

    if (shortname) {
      if (user.properties.shortname === shortname && !preferredName) {
        throw new ApolloError(
          `User with entityId '${user.entityId}' already has the shortname '${shortname}'`,
          "NO_OP"
        );
      }

      await Account.validateShortname(client)(shortname);

      await user.updateShortname(client)(shortname);
    }

    if (preferredName) {
      if (user.properties.preferredName === preferredName) {
        throw new ApolloError(
          `User with entityId '${user.entityId}' already has the preferredName '${preferredName}'`,
          "NO_OP"
        );
      }

      if (!User.preferredNameIsValid(preferredName)) {
        throw new ApolloError(
          `The preferredName '${preferredName}' is invalid`,
          "PREFERRED_NAME_INVALID"
        );
      }

      await user.updatePreferredName(client)(preferredName);
    }

    return user.toGQLUnknownEntity();
  });
