import { ApolloError } from "apollo-server-express";
import { DBClient } from "../../../db";
import User from "../../../model/user.model";
import VerificationCode from "../../../model/verificationCode.model";

export const verifyVerificationCode =
  (client: DBClient) =>
  async ({
    id,
    code,
  }: {
    id: string;
    code: string;
  }): Promise<{ user: User; verificationCode: VerificationCode }> => {
    const verificationCode = await VerificationCode.getById(client)({ id });

    if (!verificationCode) {
      throw new ApolloError(
        `A verification code with verification id '${id}' could not be found.`,
        "LOGIN_CODE_NOT_FOUND"
      );
    }

    // If the login code's maximum number of attempts has been exceeded
    if (verificationCode.hasExceededMaximumAttempts()) {
      throw new ApolloError(
        `The maximum number of attempts for the verification code with id '${id}' has been exceeded.`,
        "MAX_ATTEMPTS"
      );
    }

    // If the login code has expired
    if (verificationCode.hasExpired()) {
      throw new ApolloError(
        `The verification code with id '${verificationCode}' has expired.`,
        "EXPIRED"
      );
    }

    // If the provided code does not match the verification code
    if (verificationCode.code !== code) {
      await verificationCode.incrementAttempts(client);

      throw new ApolloError(
        `The provided verification code does not match the verification code with id '${id}'.`,
        "INCORRECT"
      );
    }

    // Otherwise, the verification code is valid and we can delete it
    await verificationCode.delete(client);

    return {
      verificationCode,
      user: await User.getUserById(client)({
        accountId: verificationCode.accountId,
        entityId: verificationCode.userId,
      })
        .then((user) => {
          if (!user) {
            throw new ApolloError(
              `A user with the id '${verificationCode.userId}' could not be found.`,
              "USER_NOT_FOUND"
            );
          }
          return user;
        })
        .catch((err) => {
          throw err;
        }),
    };
  };
