import { ApolloError } from "apollo-server-express";

import {
  MutationSendLoginCodeArgs,
  LoginCodeMetadata,
  Resolver,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { GraphQLPasswordlessStrategy } from "../../../auth/passport/PasswordlessStrategy";
import { sendLoginCodeToUser } from "../../../email";

export const sendLoginCode: Resolver<
  Promise<LoginCodeMetadata>,
  {},
  GraphQLContext,
  MutationSendLoginCodeArgs
> = async (_, { emailOrShortname }, { dataSources }) => {
  const user = emailOrShortname.includes("@")
    ? await dataSources.db
        .getUserByEmail({ email: emailOrShortname })
        .then((user) => {
          if (!user) {
            throw new ApolloError(
              `A user with the email '${emailOrShortname}' could not be found.`,
              "NOT_FOUND"
            );
          }
          return user;
        })
    : await dataSources.db
        .getUserByShortname({ shortname: emailOrShortname })
        .then((user) => {
          if (!user) {
            throw new ApolloError(
              `A user with the shortname '${emailOrShortname}' could not be found.`,
              "NOT_FOUND"
            );
          }
          return user;
        });

  const loginCode = await dataSources.db.createLoginCode({
    accountId: user.accountId,
    userId: user.entityId,
    code: GraphQLPasswordlessStrategy.generateLoginCode(),
  });

  return sendLoginCodeToUser(loginCode, user).then(() => ({
    id: loginCode.id,
    createdAt: loginCode.createdAt,
  }));
};
