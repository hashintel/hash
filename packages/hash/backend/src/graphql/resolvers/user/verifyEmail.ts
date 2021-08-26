import { ApolloError } from "apollo-server-express";

import {
  MutationVerifyEmailArgs,
  Resolver,
  User as GQLUser,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import User from "../../../model/user.model";
import { verifyVerificationCode } from "./util";

export const verifyEmail: Resolver<
  GQLUser,
  {},
  GraphQLContext,
  MutationVerifyEmailArgs
> = async (_, args, { dataSources, passport, ...ctx }) =>
  verifyVerificationCode(dataSources.db)({
    id: args.verificationId,
    code: args.verificationCode,
  }).then(async ({ user, verificationCode }) =>
    dataSources.db.transaction(async (client) => {
      const email = user.getEmail(verificationCode.emailAddress);

      // Ensure the email address is associated with the user
      if (!email)
        throw new ApolloError(
          `The user with the id '${verificationCode.userId}' did not request to verify the email address '${verificationCode.emailAddress}'.`
        );

      // Ensure the email address is not already verified
      if (email.verified)
        throw new ApolloError(
          `The user with the id '${verificationCode.userId}' has already verified the email address '${verificationCode.emailAddress}'.`,
          "ALREADY_VERIFIED"
        );

      // Ensure the email address is not already verified and associated with another user
      if (
        await User.getUserByEmail(client)({
          email: email.address,
          verified: true,
        })
      )
        throw new ApolloError(
          `The email address has already been verified by another user`,
          "ALREADY_VERIFIED"
        );

      // Otherwise the email address can be verified with the user
      await Promise.all([
        user.verifyEmailAddress(client)(email.address),
        ctx.user ? undefined : passport.login(user, {}),
      ].flat<(Promise<any> | undefined)[]>());

      return user.toGQLUser();
    })
  );
