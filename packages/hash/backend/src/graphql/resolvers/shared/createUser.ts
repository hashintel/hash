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
    // TODO: should check for uniqueness of email

    if (await User.getUserByVerifiedEmail(client)({ email })) {
      throw new ApolloError(
        `User with the email '${email}' already exists in the datastore`,
        "ALREADY_EXISTS"
      );
    }

    const user = await User.create(client)({
      emails: [{ address: email, primary: true, verified: false }],
    });

    return user
      .sendEmailVerificationCode(client)(email)
      .then((verificationCode) =>
        verificationCode.toGQLVerificationCodeMetadata()
      );
  });
