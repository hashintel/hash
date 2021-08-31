import { DBClient } from "../db";
import { EntityType } from "../db/adapter";
import {
  sendEmailVerificationCodeToEmailAddress,
  sendLoginCodeToEmailAddress,
} from "../email";
import { genId } from "../util";
import {
  UserProperties,
  User as GQLUser,
  Email,
} from "../graphql/apiTypes.gen";
import Entity, { EntityConstructorArgs } from "./entity.model";
import VerificationCode from "./verificationCode.model";
import EmailTransporter from "../email/transporter";
import { ApolloError, UserInputError } from "apollo-server-express";
import { RESTRICTED_SHORTNAMES } from "./util";

export const ALLOWED_SHORTNAME_CHARS = /^[a-zA-Z0-9-_]+$/;

type UserConstructorArgs = {
  properties: UserProperties;
} & Omit<EntityConstructorArgs, "type">;

class User extends Entity {
  properties: UserProperties;

  constructor({ properties, ...remainingArgs }: UserConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
  }

  static getEntityType = async (db: DBClient): Promise<EntityType> =>
    db
      .getSystemTypeLatestVersion({ systemTypeName: "User" })
      .then((userEntityType) => {
        if (!userEntityType) {
          throw new Error("User system entity type not found in datastore");
        }

        return userEntityType;
      });

  static getUserById =
    (db: DBClient) =>
    ({
      accountId,
      entityId,
    }: {
      accountId: string;
      entityId: string;
    }): Promise<User | null> =>
      db
        .getEntityLatestVersion({ accountId, entityId })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  static getUserByEmail =
    (db: DBClient) =>
    ({
      email,
      verified = true,
      primary,
    }: {
      email: string;
      verified?: boolean;
      primary?: boolean;
    }): Promise<User | null> =>
      db
        .getUserByEmail({ email, verified, primary })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  static getUserByShortname =
    (db: DBClient) =>
    ({ shortname }: { shortname: string }): Promise<User | null> =>
      db
        .getUserByShortname({ shortname })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  static create =
    (db: DBClient) =>
    async (properties: UserProperties): Promise<User> => {
      const id = genId();

      const entity = await db.createEntity({
        accountId: id,
        entityVersionId: id,
        createdById: id, // Users "create" themselves
        entityTypeId: (await User.getEntityType(db)).entityId,
        properties,
        versioned: false, // @todo: should user's be versioned?
      });

      return new User(entity);
    };

  private updateProperties = (db: DBClient) => (properties: UserProperties) =>
    db
      .updateEntity({
        accountId: this.accountId,
        entityVersionId: this.entityVersionId,
        entityId: this.entityId,
        properties,
      })
      .then(() => {
        this.properties = properties;
        return this;
      });

  private static checkShortnameChars = (shortname: string) => {
    if (shortname.search(ALLOWED_SHORTNAME_CHARS)) {
      throw new UserInputError(
        "Shortname may only contain letters, numbers, - or _"
      );
    }
    if (shortname[0] === "-") {
      throw new UserInputError("Shortname cannot start with '-'");
    }
  };

  static isShortnameReserved = (shortname: string): boolean =>
    RESTRICTED_SHORTNAMES.includes(shortname);

  static isShortnameTaken =
    (client: DBClient) =>
    async (shortname: string): Promise<boolean> => {
      /** @todo: check if an org with the shortname exists */

      const user = await User.getUserByShortname(client)({ shortname }).then(
        (existingUser) => existingUser === null
      );

      return user !== null;
    };

  static validateShortname =
    (client: DBClient) => async (shortname: string) => {
      User.checkShortnameChars(shortname);

      if (
        User.isShortnameReserved(shortname) ||
        (await User.isShortnameTaken(client)(shortname))
      ) {
        throw new ApolloError(`Shortname ${shortname} taken`, "NAME_TAKEN");
      }

      /** @todo: enable admins to have a shortname under 4 characters */
      if (shortname.length < 4) {
        throw new UserInputError(
          "Shortname must be at least 4 characters long."
        );
      }
      if (shortname.length > 24) {
        throw new UserInputError(
          "Shortname cannot be longer than 24 characters"
        );
      }
    };

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updateShortname = (db: DBClient) => async (updatedShortname: string) =>
    this.updateProperties(db)({
      ...this.properties,
      shortname: updatedShortname,
    });

  static preferredNameIsValid = (preferredName: string) => preferredName !== "";

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updatePreferredName = (db: DBClient) => (updatedPreferredName: string) =>
    this.updateProperties(db)({
      ...this.properties,
      preferredName: updatedPreferredName,
    });

  isAccountSignupComplete = (): boolean =>
    !!this.properties.shortname && !!this.properties.preferredName;

  getPrimaryEmail = (): Email => {
    const primaryEmail = this.properties.emails.find(
      ({ primary }) => primary === true
    );

    if (!primaryEmail) {
      throw new Error(
        `Critical: User with entityId ${this.entityId} does not have a primary email address`
      );
    }

    return primaryEmail;
  };

  getEmail = (emailAddress: string): Email | null =>
    this.properties.emails.find(({ address }) => address === emailAddress) ||
    null;

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  verifyEmailAddress = (db: DBClient) => (emailAddress: string) =>
    this.updateProperties(db)({
      ...this.properties,
      emails: this.properties.emails.map((email) =>
        email.address === emailAddress ? { ...email, verified: true } : email
      ),
    });

  sendLoginVerificationCode =
    (client: DBClient, tp: EmailTransporter) =>
    async (alternateEmailAddress?: string) => {
      // Check the supplied email address can be used for sending login codes
      if (alternateEmailAddress) {
        const email = this.getEmail(alternateEmailAddress);
        if (!email) {
          throw new Error(
            `User with entityId '${this.entityId}' does not have an email address '${alternateEmailAddress}'`
          );
        }
        if (!email.verified) {
          throw new Error(
            `User with entityId '${this.entityId}' hasn't verified the email address '${alternateEmailAddress}'`
          );
        }
      }

      const emailAddress =
        alternateEmailAddress || this.getPrimaryEmail().address;

      const verificationCode = await VerificationCode.create(client)({
        accountId: this.accountId,
        userId: this.entityId,
        emailAddress,
      });

      return sendLoginCodeToEmailAddress(tp)(
        verificationCode,
        emailAddress
      ).then(() => verificationCode);
    };

  sendEmailVerificationCode =
    (client: DBClient, tp: EmailTransporter) =>
    async (emailAddress: string) => {
      const email = this.getEmail(emailAddress);

      if (!email) {
        throw new Error(
          `User with entityId '${this.entityId}' does not have an email address '${emailAddress}'`
        );
      }

      if (email.verified) {
        throw new Error(
          `User with id '${this.entityId}' has already verified the email address '${emailAddress}'`
        );
      }

      const verificationCode = await VerificationCode.create(client)({
        accountId: this.accountId,
        userId: this.entityId,
        emailAddress,
      });

      return sendEmailVerificationCodeToEmailAddress(tp)(
        verificationCode,
        emailAddress
      ).then(() => verificationCode);
    };

  toGQLUser = (): GQLUser => ({
    ...this.toGQLUnknownEntity(),
    __typename: "User",
    accountSignupComplete: this.isAccountSignupComplete(),
  });
}

export default User;
