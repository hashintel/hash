import { ApolloError } from "apollo-server-express";
import {
  User,
  Account,
  AccountConstructorArgs,
  VerificationCode,
  Org,
} from ".";
import { DBClient } from "../db";
import {
  DBUserProperties,
  EntityType,
  UserInfoProvidedAtSignup,
} from "../db/adapter";
import {
  sendEmailVerificationCodeToEmailAddress,
  sendLoginCodeToEmailAddress,
} from "../email";
import { genId } from "../util";
import { Email } from "../graphql/apiTypes.gen";
import EmailTransporter from "../email/transporter";

export const EMAIL_RATE_LIMITING_MAX_ATTEMPTS = 5;
export const EMAIL_RATE_LIMITING_PERIOD_MS = 5 * 60 * 1000;

export const getEmailRateLimitQueryTime = () => {
  return new Date(Date.now() - EMAIL_RATE_LIMITING_PERIOD_MS);
};

type UserConstructorArgs = {
  properties: DBUserProperties;
} & Omit<AccountConstructorArgs, "type">;

class __User extends Account {
  properties: DBUserProperties;

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
    ({ entityId }: { entityId: string }): Promise<User | null> =>
      client
        .getEntityLatestVersion({ accountId: entityId, entityId })
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
    async (properties: DBUserProperties): Promise<User> => {
      const id = genId();

      const entity = await client.createEntity({
        accountId: id,
        entityId: id,
        createdById: id, // Users "create" themselves
        entityTypeId: (await User.getEntityType(client)).entityId,
        properties,
        versioned: false, // @todo: should user's be versioned?
      });

      return new User({ ...entity, properties });
    };

  updateProperties(client: DBClient) {
    return (properties: DBUserProperties) =>
      super
        .updateProperties(client)(properties)
        .then(() => {
          this.properties = properties;
          return properties;
        });
  }

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updateShortname = (client: DBClient) => async (updatedShortname: string) =>
    this.updateProperties(client)({
      ...this.properties,
      shortname: updatedShortname,
    });

  static preferredNameIsValid = (preferredName: string) => preferredName !== "";

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updatePreferredName = (client: DBClient) => (updatedPreferredName: string) =>
    this.updateProperties(client)({
      ...this.properties,
      preferredName: updatedPreferredName,
    });

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updateInfoProvidedAtSignup =
    (client: DBClient) => (updatedInfo: UserInfoProvidedAtSignup) =>
      this.updateProperties(client)({
        ...this.properties,
        infoProvidedAtSignup: {
          ...this.properties.infoProvidedAtSignup,
          ...updatedInfo,
        },
      });

  static isAccountSignupComplete = (params: {
    shortname?: string | null;
    preferredName?: string | null;
  }): boolean => !!params.shortname && !!params.preferredName;

  isAccountSignupComplete = (): boolean =>
    User.isAccountSignupComplete(this.properties);

  getPrimaryEmail = (): Email => {
    const primaryEmail = this.properties.emails.find(
      ({ primary }) => primary === true,
    );

    if (!primaryEmail) {
      throw new Error(
        `Critical: User with entityId ${this.entityId} does not have a primary email address`,
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
  addEmailAddress =
    (client: DBClient) =>
    async (email: Email): Promise<User> => {
      if (
        await User.getUserByEmail(client)({
          email: email.address,
          verified: true,
        })
      ) {
        throw new Error(
          "Cannot add email address that has already been verified by another user",
        );
      }

      if (this.getEmail(email.address)) {
        throw new Error(
          `User with entityId ${this.entityId} already has email address ${email.address}`,
        );
      }

      await this.updateProperties(client)({
        ...this.properties,
        emails: [...this.properties.emails, email],
      });

      return this;
    };

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  verifyExistingEmailAddress = (client: DBClient) => (emailAddress: string) => {
    if (!this.getEmail(emailAddress)) {
      throw new Error(
        `User with entityId ${this.entityId} does not have email address ${emailAddress}`,
      );
    }

    return this.updateProperties(client)({
      ...this.properties,
      emails: this.properties.emails.map((email) =>
        email.address === emailAddress ? { ...email, verified: true } : email,
      ),
    });
  };

  sendLoginVerificationCode =
    (client: DBClient, tp: EmailTransporter) =>
    async (params: {
      alternateEmailAddress?: string;
      redirectPath?: string;
    }) => {
      const { alternateEmailAddress, redirectPath } = params;
      // Check the supplied email address can be used for sending login codes
      if (alternateEmailAddress) {
        const email = this.getEmail(alternateEmailAddress);
        if (!email) {
          throw new Error(
            `User with entityId '${this.entityId}' does not have an email address '${alternateEmailAddress}'`,
          );
        }
        if (!email.verified) {
          throw new Error(
            `User with entityId '${this.entityId}' hasn't verified the email address '${alternateEmailAddress}'`,
          );
        }
      }

      const allowed = await this.canCreateVerificationCode(client)();
      if (!allowed) {
        throw new ApolloError(
          `User with id ${this.entityId} has created too many verification codes recently.`,
          "FORBIDDEN",
        );
      }

      const emailAddress =
        alternateEmailAddress || this.getPrimaryEmail().address;

      const verificationCode = await VerificationCode.create(client)({
        accountId: this.accountId,
        userId: this.entityId,
        emailAddress,
      });

      return sendLoginCodeToEmailAddress(tp)({
        verificationCode,
        emailAddress,
        redirectPath,
      }).then(() => verificationCode);
    };

  sendEmailVerificationCode =
    (client: DBClient, tp: EmailTransporter) =>
    async (params: { emailAddress: string; magicLinkQueryParams?: string }) => {
      const { emailAddress, magicLinkQueryParams } = params;

      const email = this.getEmail(emailAddress);

      if (!email) {
        throw new Error(
          `User with entityId '${this.entityId}' does not have an email address '${emailAddress}'`,
        );
      }

      if (email.verified) {
        throw new Error(
          `User with id '${this.entityId}' has already verified the email address '${emailAddress}'`,
        );
      }

      const allowed = await this.canCreateVerificationCode(client)();
      if (!allowed) {
        throw new ApolloError(
          `User with id ${this.entityId} has created too many verification codes recently.`,
          "FORBIDDEN",
        );
      }

      const verificationCode = await VerificationCode.create(client)({
        accountId: this.accountId,
        userId: this.entityId,
        emailAddress,
      });

      return sendEmailVerificationCodeToEmailAddress(tp)({
        verificationCode,
        emailAddress,
        magicLinkQueryParams,
      }).then(() => verificationCode);
    };

  canCreateVerificationCode = (client: DBClient) => async () => {
    const createdAfter = getEmailRateLimitQueryTime();
    const verificationCodes = await client.getUserVerificationCodes({
      userEntityId: this.entityId,
      createdAfter,
    });
    if (verificationCodes.length >= EMAIL_RATE_LIMITING_MAX_ATTEMPTS) {
      return false;
    }
    return true;
  };

  isMemberOfOrg = ({ entityId }: Org) =>
    this.properties.memberOf.find(
      ({ org }) => org.__linkedData.entityId === entityId,
    ) !== undefined;

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  joinOrg =
    (client: DBClient) =>
    async (params: { org: Org; responsibility: string }) => {
      if (this.isMemberOfOrg(params.org)) {
        throw new Error(
          `User with entityId '${this.entityId}' is already a member of the organization with entityId '${params.org.entityId}'`,
        );
      }

      await this.updateProperties(client)({
        ...this.properties,
        memberOf: [
          ...this.properties.memberOf,
          {
            org: params.org.convertToDBLink(),
            responsibility: params.responsibility,
          },
        ],
      });

      return this;
    };
}

export default __User;
