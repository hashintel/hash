import {
  MutationCreateUserArgs,
  Resolver,
  VerificationCodeMetadata,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import User from "../../../model/user.model";
import { ApolloError } from "apollo-server-express";

export const createUser: Resolver<
  Promise<VerificationCodeMetadata>,
  {},
  GraphQLContext,
  MutationCreateUserArgs
> = async (_, { email }, { dataSources }) => {
  // TODO: should check for uniqueness of email

  if (await User.getUserByEmail(dataSources.db)({ email })) {
    throw new ApolloError(
      `User with the email '${email}' already exists in the datastore`,
      "ALREADY_EXISTS"
    );
  }

  const user = await User.create(dataSources.db)({
    emails: [{ address: email, primary: true, verified: false }],
  });

  return user
    .sendEmailVerificationCode(dataSources.db)(email)
    .then((verificationCode) =>
      verificationCode.toGQLVerificationCodeMetadata()
    );
};
