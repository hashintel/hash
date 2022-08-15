import { ApolloError, ForbiddenError } from "apollo-server-express";

import { Account, User } from "../../../model";
import { MutationUpdateUserArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { mapUserModelToGQL, UnresolvedGQLUser } from "./util";

export const updateUser: Resolver<
  Promise<UnresolvedGQLUser>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateUserArgs
> = async (_, { userEntityId, properties }, { dataSources, user }) =>
  dataSources.db.transaction(async (client) => {
    const { graphApi } = dataSources;
    /** @todo: allow HASH admins to bypass this */

    if (userEntityId !== user.entityId) {
      throw new ForbiddenError("You can only update your own user properties");
    }

    const { shortname, preferredName, usingHow } = properties;

    if (!shortname && !preferredName && !usingHow) {
      throw new ApolloError(
        "An updated 'shortname', 'preferredName' or 'usingHow' value  must be provided to update a user",
        "NO_OP",
      );
    }

    if (shortname) {
      if (user.getShortname() === shortname && !preferredName) {
        throw new ApolloError(
          `User with entityId '${user.entityId}' already has the shortname '${shortname}'`,
          "NO_OP",
        );
      }

      await Account.validateShortname(client, shortname);

      await user.updateShortname(graphApi, {
        updatedByAccountId: user.accountId,
        updatedShortname: shortname,
      });
    }

    if (preferredName) {
      if (user.getPreferredName() === preferredName) {
        throw new ApolloError(
          `User with entityId '${user.entityId}' already has the preferredName '${preferredName}'`,
          "NO_OP",
        );
      }

      if (!User.preferredNameIsValid(preferredName)) {
        throw new ApolloError(
          `The preferredName '${preferredName}' is invalid`,
          "PREFERRED_NAME_INVALID",
        );
      }

      await user.updatePreferredName(graphApi, {
        updatedByAccountId: user.accountId,
        updatedPreferredName: preferredName,
      });
    }

    if (usingHow) {
      if (user.getInfoProvidedAtSignup().usingHow === usingHow) {
        throw new ApolloError(
          `User with entityId '${user.entityId}' already indicated how they are using HASH '${usingHow}'`,
          "NO_OP",
        );
      }

      await user.updateInfoProvidedAtSignup(graphApi, {
        updatedByAccountId: user.accountId,
        updatedInfo: { usingHow },
      });
    }

    return mapUserModelToGQL(user);
  });
