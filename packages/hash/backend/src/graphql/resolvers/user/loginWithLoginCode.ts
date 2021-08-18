import { ApolloError } from "apollo-server-express";

import User from "../../../model/user.model";
import {
  LOGIN_CODE_MAX_AGE,
  LOGIN_CODE_MAX_ATTEMPTS,
} from "../../../auth/passport/PasswordlessStrategy";
import {
  MutationLoginWithLoginCodeArgs,
  Resolver,
  User as GQLUser,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const loginWithLoginCode: Resolver<
  GQLUser,
  {},
  GraphQLContext,
  MutationLoginWithLoginCodeArgs
> = async (_, { verificationId, ...args }, { dataSources, passport }) => {
  const verificationCode = await dataSources.db.getVerificationCode({
    id: verificationId,
  });

  if (!verificationCode)
    throw new ApolloError(
      `A verification code with verification id '${verificationId}' could not be found.`,
      "LOGIN_CODE_NOT_FOUND"
    );

  // If the login code's maximum number of attempts has been exceeded
  if (verificationCode.numberOfAttempts >= LOGIN_CODE_MAX_ATTEMPTS)
    throw new ApolloError(
      `The maximum number of attempts for the verification code with id '${verificationId}' has been exceeded.`,
      "MAX_ATTEMPTS"
    );

  // If the login code has expired
  if (
    verificationCode.createdAt.getTime() <
    new Date().getTime() - LOGIN_CODE_MAX_AGE
  )
    throw new ApolloError(
      `The verification code with id '${verificationCode}' has expired.`,
      "EXPIRED"
    );

  // Otherwise, let's check if the provided code matches the login code
  if (verificationCode.code === args.verificationCode) {
    const user = await User.getUserById(dataSources.db)({
      id: verificationCode.userId,
    })
      .then((user) => {
        if (!user)
          throw new ApolloError(
            `A user with the id '${verificationCode.userId}' could not be found.`,
            "USER_NOT_FOUND"
          );
        return user;
      })
      .catch((err) => {
        throw err;
      });

    await passport.login(user, {});

    return user.toGQLUser();
  }

  await dataSources.db.incrementVerificationCodeAttempts({ verificationCode });

  throw new ApolloError(
    `The provided verification code does not match the verification code with id '${verificationId}'.`,
    "INCORRECT"
  );
};
