import { ApolloError } from "apollo-server-express";

import User from "../../../model/user.model";

import {
  MutationSendLoginCodeArgs,
  VerificationCodeMetadata,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const sendLoginCode: Resolver<
  Promise<VerificationCodeMetadata>,
  {},
  GraphQLContext,
  MutationSendLoginCodeArgs
> = async (_, { emailOrShortname }, { dataSources }) => {
  const hasProvidedEmail = emailOrShortname.includes("@");

  const user = hasProvidedEmail
    ? await User.getUserByVerifiedEmail(dataSources.db)({
        email: emailOrShortname,
      }).then((user) => {
        if (!user)
          throw new ApolloError(
            `A user with the email '${emailOrShortname}' could not be found.`,
            "NOT_FOUND"
          );
        return user;
      })
    : await User.getUserByShortname(dataSources.db)({
        shortname: emailOrShortname,
      }).then((user) => {
        if (!user)
          throw new ApolloError(
            `A user with the shortname '${emailOrShortname}' could not be found.`,
            "NOT_FOUND"
          );
        return user;
      });

  return user
    .sendLoginVerificationCode(dataSources.db)(
      hasProvidedEmail ? emailOrShortname : undefined
    )
    .then((verificationCode) =>
      verificationCode.toGQLVerificationCodeMetadata()
    );
};
