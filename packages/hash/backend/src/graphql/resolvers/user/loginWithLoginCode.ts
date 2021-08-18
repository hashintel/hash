import { ApolloError } from "apollo-server-express";

import User from "../../../model/user.model";
import {
  MutationLoginWithLoginCodeArgs,
  Resolver,
  User as GQLUser,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import VerificationCode from "../../../model/verificationCode.model";

export const loginWithLoginCode: Resolver<
  GQLUser,
  {},
  GraphQLContext,
  MutationLoginWithLoginCodeArgs
> = async (_, { verificationId, ...args }, { dataSources, passport }) => {
  const verificationCode = await VerificationCode.getById(dataSources.db)({
    id: verificationId,
  });

  if (!verificationCode)
    throw new ApolloError(
      `A verification code with verification id '${verificationId}' could not be found.`,
      "LOGIN_CODE_NOT_FOUND"
    );

  // If the login code's maximum number of attempts has been exceeded
  if (verificationCode.hasExceededMaximumAttempts())
    throw new ApolloError(
      `The maximum number of attempts for the verification code with id '${verificationId}' has been exceeded.`,
      "MAX_ATTEMPTS"
    );

  // If the login code has expired
  if (verificationCode.hasExpired())
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

  await verificationCode.incrementAttempts(dataSources.db);

  throw new ApolloError(
    `The provided verification code does not match the verification code with id '${verificationId}'.`,
    "INCORRECT"
  );
};
