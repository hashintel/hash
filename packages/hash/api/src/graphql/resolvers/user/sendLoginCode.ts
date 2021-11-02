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
> = async (
  _,
  { emailOrShortname, redirectPath },
  { dataSources, emailTransporter },
) =>
  dataSources.db.transaction(async (client) => {
    const hasProvidedEmail = emailOrShortname.includes("@");

    const user = hasProvidedEmail
      ? await User.getUserByEmail(client)({
          email: emailOrShortname,
          verified: true,
        }).then((fetchedUser) => {
          /**
           * @todo: if the email address is associated with a user but it hasn't been verified,
           * send an email verification code to the user and return it
           */

          if (!fetchedUser) {
            throw new ApolloError(
              `A user with the email '${emailOrShortname}' could not be found.`,
              "NOT_FOUND",
            );
          }
          return fetchedUser;
        })
      : await User.getUserByShortname(client)({
          shortname: emailOrShortname,
        }).then((fetchedUser) => {
          if (!fetchedUser) {
            throw new ApolloError(
              `A user with the shortname '${emailOrShortname}' could not be found.`,
              "NOT_FOUND",
            );
          }
          return fetchedUser;
        });

    /** @todo: rate limit login codes sent to the user */

    return user
      .sendLoginVerificationCode(
        client,
        emailTransporter,
      )({
        alternateEmailAddress: hasProvidedEmail ? emailOrShortname : undefined,
        redirectPath: redirectPath || undefined,
      })
      .then((verificationCode) =>
        verificationCode.toGQLVerificationCodeMetadata(),
      );
  });
