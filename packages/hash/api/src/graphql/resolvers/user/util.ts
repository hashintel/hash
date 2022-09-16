import { ApolloError } from "apollo-server-express";
import { User as GQLUser, Visibility } from "../../apiTypes.gen";
import { UserModel, User, VerificationCode } from "../../../model";
import { DbClient } from "../../../db";

type GQLUserExternalResolvers =
  | "accountSignupComplete"
  | "memberOf"
  | "entityType"
  | "linkGroups"
  | "linkedEntities"
  | "linkedAggregations";

export type UnresolvedGQLUser = Omit<GQLUser, GQLUserExternalResolvers>;

/** @todo: address the below todos as part of https://app.asana.com/0/0/1202996188015545/f */
export const mapUserModelToGQL = async (
  user: UserModel,
): Promise<UnresolvedGQLUser> => {
  return {
    accountId: user.entityId,
    id: user.entityId,
    entityId: user.entityId,
    entityVersionId: user.version,
    entityTypeId: "" /** @todo: deprecate this field */,
    entityTypeVersionId: user.entityTypeModel.schema.$id,
    entityTypeName: user.entityTypeModel.schema.title,
    shortname: user.getShortname(),
    preferredName: user.getPreferredName(),
    emails: await user.getQualifiedEmails(),
    entityVersionCreatedAt:
      new Date().toISOString() /** @todo: stop hardcoding this */,
    createdAt: new Date().toISOString() /** @todo: stop hardcoding this */,
    updatedAt: new Date().toISOString() /** @todo: stop hardcoding this */,
    createdByAccountId: "" /** @todo: stop hardcoding this */,
    visibility:
      Visibility.Public /** @todo: potentially deprecate or stop hardcoding this */,
  };
};

export const verifyVerificationCode =
  (client: DbClient) =>
  async ({
    id,
    code,
  }: {
    id: string;
    code: string;
  }): Promise<{ user: User; verificationCode: VerificationCode }> => {
    const verificationCode = await VerificationCode.getById(client, { id });

    if (!verificationCode) {
      throw new ApolloError(
        `A verification code with verification id '${id}' could not be found.`,
        "LOGIN_CODE_NOT_FOUND",
      );
    }

    // If the verification code's maximum number of attempts has been exceeded
    if (verificationCode.hasExceededMaximumAttempts()) {
      throw new ApolloError(
        `The maximum number of attempts for the verification code with id '${id}' has been exceeded.`,
        "MAX_ATTEMPTS",
      );
    }

    // If the verification code has expired
    if (verificationCode.hasExpired()) {
      throw new ApolloError(
        `The verification code with id '${id}' has expired.`,
        "EXPIRED",
      );
    }

    // If the verification code has already been used
    if (verificationCode.hasBeenUsed()) {
      throw new ApolloError(
        `The verification code with id '${id}' has already been used.`,
        "ALREADY_USED",
      );
    }

    // If the provided code does not match the verification code
    if (verificationCode.code !== code) {
      await verificationCode.incrementAttempts(client);

      throw new ApolloError(
        `The provided verification code does not match the verification code with id '${id}'.`,
        "INCORRECT",
      );
    }

    // Otherwise, the verification code is valid and we can use it
    await verificationCode.setToUsed(client);

    return {
      verificationCode,
      user: await User.getUserById(client, {
        entityId: verificationCode.userId,
      })
        .then((user) => {
          if (!user) {
            throw new ApolloError(
              `A user with the id '${verificationCode.userId}' could not be found.`,
              "USER_NOT_FOUND",
            );
          }
          return user;
        })
        .catch((err) => {
          throw err;
        }),
    };
  };
