import {
  ApolloError,
  ForbiddenError,
  UserInputError,
} from "apollo-server-express";
import { GraphApi } from "../../../graph";

import {
  shortnameMaximumLength,
  shortnameMinimumLength,
  UserModel,
} from "../../../model";
import { MutationUpdateUserArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { mapUserModelToGQL, UnresolvedGQLUser } from "./util";

export const ALLOWED_SHORTNAME_CHARS = /^[a-zA-Z0-9-_]+$/;

const validateShortname = async (graphApi: GraphApi, shortname: string) => {
  if (UserModel.shortnameContainsInvalidCharacter(shortname)) {
    throw new UserInputError(
      "Shortname may only contain letters, numbers, - or _",
    );
  }
  if (shortname[0] === "-") {
    throw new UserInputError("Shortname cannot start with '-'");
  }

  if (
    UserModel.shortnameIsRestricted(shortname) ||
    (await UserModel.shortnameIsTaken(graphApi, { shortname }))
  ) {
    throw new ApolloError(`Shortname ${shortname} taken`, "NAME_TAKEN");
  }

  /** @todo: enable admins to have a shortname under 4 characters */
  if (shortname.length < shortnameMinimumLength) {
    throw new UserInputError("Shortname must be at least 4 characters long.");
  }
  if (shortname.length > shortnameMaximumLength) {
    throw new UserInputError("Shortname cannot be longer than 24 characters");
  }
};

export const updateUser: Resolver<
  Promise<UnresolvedGQLUser>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateUserArgs
> = async (
  _,
  { userEntityId, properties },
  { dataSources: { graphApi }, user },
) => {
  /** @todo: run this mutation in a transaction */

  /** @todo: allow HASH admins to bypass this */
  if (userEntityId !== user.entityId) {
    throw new ForbiddenError("You can only update your own user properties");
  }

  let updatedUser = user;

  const { shortname, preferredName } = properties;

  if (shortname && user.getShortname() !== shortname) {
    await validateShortname(graphApi, shortname);

    updatedUser = await updatedUser.updateShortname(graphApi, {
      updatedByAccountId: user.accountId,
      updatedShortname: shortname,
    });
  }

  if (preferredName && user.getPreferredName() !== preferredName) {
    if (UserModel.preferredNameIsInvalid(preferredName)) {
      throw new ApolloError(
        `The preferredName '${preferredName}' is invalid`,
        "PREFERRED_NAME_INVALID",
      );
    }

    updatedUser = await updatedUser.updatePreferredName(graphApi, {
      updatedByAccountId: user.accountId,
      updatedPreferredName: preferredName,
    });
  }

  /** @todo: store how a user indicated they are using HASH */
  // if (usingHow) {
  //   await user.updateInfoProvidedAtSignup(graphApi, {
  //     updatedByAccountId: user.accountId,
  //     updatedInfo: { usingHow },
  //   });
  // }

  return mapUserModelToGQL(updatedUser);
};
