import { ApolloError } from "apollo-server-express";

import {
  MutationCreateUserArgs,
  Resolver,
  VerificationCodeMetadata,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import User from "../../../model/user.model";

export const createUser: Resolver<
  Promise<VerificationCodeMetadata>,
  {},
  GraphQLContext,
  MutationCreateUserArgs
> = async (_, { email }, { dataSources }) =>
  dataSources.db.transaction(async (client) => {
    // Ensure the email address isn't already verified and associated with a user
    if (await User.getUserByEmail(client)({ email, verified: true })) {
      throw new ApolloError(
        `User with the email '${email}' already exists in the datastore`,
        "ALREADY_EXISTS"
      );
    }

    /**
     * @todo: Account for when the email is the primary email of an existing user, but is unverified.
     * This would occur when a user is created and before the email is verified the user is created again.
     */

    // Othwerise create a user in the datastore with the email address
    const user = await User.create(client)({
      emails: [{ address: email, primary: true, verified: false }],
    });

    return user
      .sendEmailVerificationCode(client)(email)
      .then((verificationCode) =>
        verificationCode.toGQLVerificationCodeMetadata()
      );
  });
