import {
  User,
  Entity,
  Account,
  AccountConstructorArgs,
  EntityTypeWithoutTypeFields,
  VerificationCode,
} from ".";
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
import EmailTransporter from "../email/transporter";

type UserConstructorArgs = {
  properties: UserProperties;
} & Omit<AccountConstructorArgs, "type">;

class __User extends Account {
  properties: UserProperties;

  constructor({ properties, ...remainingArgs }: UserConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
  }

  static getEntityType = async (client: DBClient): Promise<EntityType> =>
    client
      .getSystemTypeLatestVersion({ systemTypeName: "User" })
      .then((userEntityType) => {
        if (!userEntityType) {
          throw new Error("User system entity type not found in datastore");
        }

        return userEntityType;
      });

  static getUserById =
    (client: DBClient) =>
    ({
      accountId,
      entityId,
    }: {
      accountId: string;
      entityId: string;
    }): Promise<User | null> =>
      client
        .getEntityLatestVersion({ accountId, entityId })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  static getUserByEmail =
    (client: DBClient) =>
    ({
      email,
      verified = true,
      primary,
    }: {
      email: string;
      verified?: boolean;
      primary?: boolean;
    }): Promise<User | null> =>
      client
        .getUserByEmail({ email, verified, primary })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  static getUserByShortname =
    (client: DBClient) =>
    ({ shortname }: { shortname: string }): Promise<User | null> =>
      client
        .getUserByShortname({ shortname })
        .then((dbUser) => (dbUser ? new User(dbUser) : null));

  static createUser =
    (client: DBClient) =>
    async (properties: UserProperties): Promise<User> => {
      const id = genId();

      const entity = await Entity.create(client)({
        accountId: id,
        entityId: id,
        createdById: id, // Users "create" themselves
        entityTypeId: (await User.getEntityType(client)).entityId,
        properties,
        versioned: false, // @todo: should user's be versioned?
      });

      return new User({ ...entity, properties });
    };

  private updateUserProperties =
    (client: DBClient) => (properties: UserProperties) =>
      this.updateProperties(client)(properties);

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updateShortname = (client: DBClient) => async (updatedShortname: string) =>
    this.updateUserProperties(client)({
      ...this.properties,
      shortname: updatedShortname,
    });

  static preferredNameIsValid = (preferredName: string) => preferredName !== "";

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updatePreferredName = (client: DBClient) => (updatedPreferredName: string) =>
    this.updateUserProperties(client)({
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
  verifyEmailAddress = (client: DBClient) => (emailAddress: string) =>
    this.updateUserProperties(client)({
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

  toGQLUser = (): Omit<GQLUser, "entityType"> & {
    entityType: EntityTypeWithoutTypeFields;
  } => ({
    ...this.toGQLUnknownEntity(),
    accountSignupComplete: this.isAccountSignupComplete(),
  });
}

export default __User;
