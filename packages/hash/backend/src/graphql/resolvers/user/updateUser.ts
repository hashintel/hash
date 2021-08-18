import { ApolloError, ForbiddenError } from "apollo-server-express";

import User from "../../../model/user.model";
import {
  MutationUpdateUserArgs,
  Resolver,
  User as GQLUser,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";

export const updateUser: Resolver<
  Promise<GQLUser>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateUserArgs
> = async (_, { id, properties }, { dataSources, user }) => {
  // @todo: allow HASH admins to bipass this
  if (id !== user.id)
    throw new ForbiddenError("You can only update your own user properties");

  const { shortname, preferredName } = properties;

  if (!shortname && !preferredName)
    throw new ApolloError(
      "An updated shortname or preferredName must be provided to update a user",
      "NO_OP"
    );

  if (shortname) {
    if (user.properties.shortname === shortname && !preferredName)
      throw new ApolloError(
        `User with id '${user.id}' already has the shortname '${shortname}'`,
        "NO_OP"
      );

    if (!(await User.shortnameIsUnique(dataSources.db)(shortname)))
      throw new ApolloError(
        `The shortname '${shortname}' is already taken`,
        "SHORTNAME_TAKEN"
      );

    if (!User.shortnameIsValid(shortname))
      throw new ApolloError(
        `The shortname '${shortname}' is invalid`,
        "SHORTNAME_INVALID"
      );

    await user.updateShortname(dataSources.db)(shortname);
  }

  if (preferredName) {
    if (user.properties.preferredName === preferredName)
      throw new ApolloError(
        `User with id '${user.id}' already has the preferredName '${preferredName}'`,
        "NO_OP"
      );

    if (!User.preferredNameIsValid(preferredName))
      throw new ApolloError(
        `The preferredName '${preferredName}' is invalid`,
        "PREFERRED_NAME_INVALID"
      );

    await user.updatePreferredName(dataSources.db)(preferredName);
  }

  return user.toGQLUser();
};
