import { ApolloError } from "apollo-server-express";

import {
  MutationVerifyEmailArgs,
  Resolver,
  User as GQLUser,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { verifyVerificationCode } from "./util";

export const verifyEmail: Resolver<
  GQLUser,
  {},
  GraphQLContext,
  MutationVerifyEmailArgs
> = async (_, args, { dataSources, passport, ...ctx }) =>
  dataSources.db.transaction((client) =>
    verifyVerificationCode(client)({
      id: args.verificationId,
      code: args.verificationCode,
    }).then(async ({ user, verificationCode }) => {
      const email = user.getEmail(verificationCode.emailAddress);

      if (!email)
        throw new ApolloError(
          `The user with the id '${verificationCode.userId}' did not request to verify the email address '${verificationCode.emailAddress}'.`
        );

      if (email.verified)
        throw new ApolloError(
          `The user with the id '${verificationCode.userId}' has already verified the email address '${verificationCode.emailAddress}'.`,
          "ALREADY_VERIFIED"
        );

      await user.verifyEmailAddress(client)(email.address);

      // If the user isn't already logged-in, log them in
      if (!ctx.user) await passport.login(user, {});

      return user.toGQLUser();
    })
  );
