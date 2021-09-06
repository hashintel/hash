import { ApolloError } from "apollo-server-express";

import { User } from "../../../model";

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
> = async (_, { emailOrShortname }, { dataSources, emailTransporter }) =>
  dataSources.db.transaction(async (client) => {
    const hasProvidedEmail = emailOrShortname.includes("@");

    const user = hasProvidedEmail
      ? await User.getUserByEmail(client)({
          email: emailOrShortname,
          verified: true,
        }).then((user) => {
          /**
           * @todo: if the email address is associated with a user but it hasn't been verified,
           * send an email verification code to the user and return it
           */

          if (!user) {
            throw new ApolloError(
              `A user with the email '${emailOrShortname}' could not be found.`,
              "NOT_FOUND"
            );
          }
          return user;
        })
      : await User.getUserByShortname(client)({
          shortname: emailOrShortname,
        }).then((user) => {
          if (!user) {
            throw new ApolloError(
              `A user with the shortname '${emailOrShortname}' could not be found.`,
              "NOT_FOUND"
            );
          }
          return user;
        });

    /** @todo: rate limit login codes sent to the user */

    return user
      .sendLoginVerificationCode(
        client,
        emailTransporter
      )(hasProvidedEmail ? emailOrShortname : undefined)
      .then((verificationCode) =>
        verificationCode.toGQLVerificationCodeMetadata()
      );
  });
