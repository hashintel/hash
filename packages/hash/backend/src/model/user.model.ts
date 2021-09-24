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

  private updateUserProperties =
    (client: DBClient) => (properties: DBUserProperties) =>
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

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updateInfoProvidedAtSignup =
    (client: DBClient) => (updatedInfo: UserInfoProvidedAtSignup) =>
      this.updateUserProperties(client)({
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

      return sendEmailVerificationCodeToEmailAddress(tp)({
        verificationCode,
        emailAddress,
        magicLinkQueryParams,
      }).then(() => verificationCode);
    };

  isMemberOfOrg = ({ entityId }: Org) =>
    this.properties.memberOf.find(
      ({ org }) => org.__linkedData.entityId === entityId
    ) !== undefined;

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  joinOrg =
    (client: DBClient) => (params: { org: Org; responsibility: string }) => {
      if (this.isMemberOfOrg(params.org)) {
        throw new Error(
          `User with entityId '${this.entityId}' is already a member of the organization with entityId '${params.org.entityId}'`
        );
      }
      return this.updateUserProperties(client)({
        ...this.properties,
        memberOf: [
          ...this.properties.memberOf,
          {
            org: params.org.convertToDBLink(),
            responsibility: params.responsibility,
          },
        ],
      });
    };
}

export default __User;
