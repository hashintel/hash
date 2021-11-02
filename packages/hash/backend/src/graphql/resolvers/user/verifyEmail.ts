import { ApolloError } from "apollo-server-express";

import { MutationVerifyEmailArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { User, UnresolvedGQLEntity } from "../../../model";
import { verifyVerificationCode } from "./util";

export const verifyEmail: Resolver<
  UnresolvedGQLEntity,
  {},
  GraphQLContext,
  MutationVerifyEmailArgs
> = async (_, args, { dataSources, passport, ...ctx }) =>
  dataSources.db.transaction(async (client) =>
    verifyVerificationCode(client)({
      id: args.verificationId,
      code: args.verificationCode,
    }).then(async ({ user, verificationCode }) => {
      const email = user.getEmail(verificationCode.emailAddress);

      // Ensure the email address is associated with the user
      if (!email) {
        throw new ApolloError(
          `The user associated with the verification code did not request to verify the email address associated with the verification code.`,
        );
      }

      // Ensure the email address is not already verified
      if (email.verified) {
        throw new ApolloError(
          `The user with the id '${verificationCode.userId}' has already verified the email address '${verificationCode.emailAddress}'.`,
          "ALREADY_VERIFIED",
        );
      }

      // Ensure the email address is not already verified and associated with another user
      if (
        await User.getUserByEmail(client)({
          email: email.address,
          verified: true,
        })
      ) {
        throw new ApolloError(
          `The email address has already been verified by another user`,
          "ALREADY_VERIFIED",
        );
      }

      // Otherwise the email address can be verified with the user
      await Promise.all(
        [
          user.verifyExistingEmailAddress(client)(email.address),
          ctx.user ? undefined : passport.login(user, {}),
        ].flat<(Promise<any> | undefined)[]>(),
      );

      return user.toGQLUnknownEntity();
    }),
  );
