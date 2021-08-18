import { ApolloError } from "apollo-server-express";

import {
  MutationSendLoginCodeArgs,
  VerificationCodeMetadata,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { GraphQLPasswordlessStrategy } from "../../../auth/passport/PasswordlessStrategy";
import { sendLoginCodeToEmailAddress } from "../../../email";
import User from "src/model/user.model";

export const sendLoginCode: Resolver<
  Promise<VerificationCodeMetadata>,
  {},
  GraphQLContext,
  MutationSendLoginCodeArgs
> = async (_, { emailOrShortname }, { dataSources }) => {
  const hasProvidedEmail = emailOrShortname.includes("@");

  const user = hasProvidedEmail
    ? await User.getUserByEmail(dataSources.db)({
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

  const verificationCode = await dataSources.db.createVerificationCode({
    accountId: user.accountId,
    userId: user.entityId,
    code: GraphQLPasswordlessStrategy.generateLoginCode(),
  });

  const verificationEmailAdress = hasProvidedEmail
    ? emailOrShortname
    : user.getPrimaryEmail().address;

  return sendLoginCodeToEmailAddress(verificationCode, verificationEmailAdress).then(
    () => ({
      id: verificationCode.id,
      createdAt: verificationCode.createdAt,
    })
  );
};
