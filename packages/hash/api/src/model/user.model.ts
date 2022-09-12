import { ApolloError } from "apollo-server-express";
import {
  User,
  Account,
  AccountConstructorArgs,
  VerificationCode,
  Org,
  OrgMembership,
  UpdatePropertiesPayload,
  PartialPropertiesUpdatePayload,
  Link,
} from ".";
import { DbClient } from "../db";
import {
  DbUserProperties,
  EntityType,
  UserInfoProvidedAtSignup,
} from "../db/adapter";
import {
  sendEmailVerificationCodeToEmailAddress,
  sendLoginCodeToEmailAddress,
} from "../email";
import { genId } from "../util";
import { Email } from "../graphql/apiTypes.gen";
import { EmailTransporter } from "../email/transporters";

export const EMAIL_RATE_LIMITING_MAX_ATTEMPTS = 5;
export const EMAIL_RATE_LIMITING_PERIOD_MS = 5 * 60 * 1000;

export const getEmailRateLimitQueryTime = () => {
  return new Date(Date.now() - EMAIL_RATE_LIMITING_PERIOD_MS);
};

type UserConstructorArgs = {
  properties: DbUserProperties;
} & Omit<AccountConstructorArgs, "type">;

class __User extends Account {
  properties: DbUserProperties;

  constructor({ properties, ...remainingArgs }: UserConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
  }

  static async getEntityType(client: DbClient): Promise<EntityType> {
    const userEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "User",
    });
    return userEntityType;
  }

  static async getUserById(
    client: DbClient,
    params: { entityId: string },
  ): Promise<User | null> {
    const { entityId } = params;
    const dbUser = await client.getEntityLatestVersion({
      accountId: entityId,
      entityId,
    });

    return dbUser ? new User(dbUser) : null;
  }

  static async getUserByEmail(
    client: DbClient,
    params: {
      email: string;
      verified?: boolean;
      primary?: boolean;
    },
  ): Promise<User | null> {
    const { verified } = params;
    const dbUser = await client.getUserByEmail({
      ...params,
      verified: verified === undefined ? true : verified,
    });

    return dbUser ? new User(dbUser) : null;
  }

  static async getUserByShortname(
    client: DbClient,
    params: { shortname: string },
  ): Promise<User | null> {
    const dbUser = await client.getUserByShortname(params);
    return dbUser ? new User(dbUser) : null;
  }

  static async createUser(
    client: DbClient,
    properties: DbUserProperties,
  ): Promise<User> {
    const id = genId();

    const entity = await client.createEntity({
      accountId: id,
      entityId: id,
      createdByAccountId: id, // Users "create" themselves
      entityTypeId: (await User.getEntityType(client)).entityId,
      properties,
      versioned: false, // @todo: should user's be versioned?
    });

    return new User({ ...entity, properties });
  }

  async partialPropertiesUpdate(
    client: DbClient,
    params: PartialPropertiesUpdatePayload<DbUserProperties>,
  ) {
    return await super.partialPropertiesUpdate(client, params);
  }

  async updateProperties(
    client: DbClient,
    params: UpdatePropertiesPayload<DbUserProperties>,
  ) {
    await super.updateProperties(client, params);
    this.properties = params.properties;

    return params.properties;
  }

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updateShortname(
    client: DbClient,
    params: {
      updatedByAccountId: string;
      updatedShortname: string;
    },
  ) {
    return this.partialPropertiesUpdate(client, {
      updatedByAccountId: params.updatedByAccountId,
      properties: {
        shortname: params.updatedShortname,
      },
    });
  }

  static preferredNameIsValid(preferredName: string) {
    return preferredName !== "";
  }

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updatePreferredName(
    client: DbClient,
    params: {
      updatedByAccountId: string;
      updatedPreferredName: string;
    },
  ) {
    return this.partialPropertiesUpdate(client, {
      updatedByAccountId: params.updatedByAccountId,
      properties: {
        preferredName: params.updatedPreferredName,
      },
    });
  }

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updateInfoProvidedAtSignup(
    client: DbClient,
    params: {
      updatedByAccountId: string;
      updatedInfo: UserInfoProvidedAtSignup;
    },
  ) {
    return this.partialPropertiesUpdate(client, {
      updatedByAccountId: params.updatedByAccountId,
      properties: {
        infoProvidedAtSignup: {
          ...this.properties.infoProvidedAtSignup,
          ...params.updatedInfo,
        },
      },
    });
  }

  static isAccountSignupComplete(params: {
    shortname?: string | null;
    preferredName?: string | null;
  }): boolean {
    return !!params.shortname && !!params.preferredName;
  }

  isAccountSignupComplete(): boolean {
    return User.isAccountSignupComplete(this.properties);
  }

  getPrimaryEmail(): Email {
    const primaryEmail = this.properties.emails.find(
      ({ primary }) => primary === true,
    );

    if (!primaryEmail) {
      throw new Error(
        `Critical: User with entityId ${this.entityId} does not have a primary email address`,
      );
    }

    return primaryEmail;
  }

  getEmail(emailAddress: string): Email | null {
    return (
      this.properties.emails.find(({ address }) => address === emailAddress) ||
      null
    );
  }

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  async addEmailAddress(
    client: DbClient,
    params: {
      updatedByAccountId: string;
      email: Email;
    },
  ): Promise<User> {
    if (
      await User.getUserByEmail(client, {
        email: params.email.address,
        verified: true,
      })
    ) {
      throw new Error(
        "Cannot add email address that has already been verified by another user",
      );
    }

    if (this.getEmail(params.email.address)) {
      throw new Error(
        `User with entityId ${this.entityId} already has email address ${params.email.address}`,
      );
    }

    await this.partialPropertiesUpdate(client, {
      updatedByAccountId: params.updatedByAccountId,
      properties: {
        emails: [...this.properties.emails, params.email],
      },
    });

    return this;
  }

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  verifyExistingEmailAddress(
    client: DbClient,
    params: {
      updatedByAccountId: string;
      emailAddress: string;
    },
  ) {
    if (!this.getEmail(params.emailAddress)) {
      throw new Error(
        `User with entityId ${this.entityId} does not have email address ${params.emailAddress}`,
      );
    }

    return this.partialPropertiesUpdate(client, {
      updatedByAccountId: params.updatedByAccountId,
      properties: {
        emails: this.properties.emails.map((email) =>
          email.address === params.emailAddress
            ? { ...email, verified: true }
            : email,
        ),
      },
    });
  }

  async sendLoginVerificationCode(
    client: DbClient,
    tp: EmailTransporter,
    params: {
      alternateEmailAddress?: string;
      redirectPath?: string;
    },
  ) {
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

    const allowed = await this.canCreateVerificationCode(client);
    if (!allowed) {
      throw new ApolloError(
        `User with id ${this.entityId} has created too many verification codes recently.`,
        "FORBIDDEN",
      );
    }

    const emailAddress =
      alternateEmailAddress || this.getPrimaryEmail().address;

    const verificationCode = await VerificationCode.create(client, {
      accountId: this.accountId,
      userId: this.entityId,
      emailAddress,
    });

    return sendLoginCodeToEmailAddress(tp)({
      verificationCode,
      emailAddress,
      redirectPath,
    }).then(() => verificationCode);
  }

  async sendEmailVerificationCode(
    client: DbClient,
    tp: EmailTransporter,
    params: { emailAddress: string; magicLinkQueryParams?: string },
  ) {
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

    const allowed = await this.canCreateVerificationCode(client);
    if (!allowed) {
      throw new ApolloError(
        `User with id ${this.entityId} has created too many verification codes recently.`,
        "FORBIDDEN",
      );
    }

    const verificationCode = await VerificationCode.create(client, {
      accountId: this.accountId,
      userId: this.entityId,
      emailAddress,
    });

    return sendEmailVerificationCodeToEmailAddress(tp)({
      verificationCode,
      emailAddress,
      magicLinkQueryParams,
    }).then(() => verificationCode);
  }

  async canCreateVerificationCode(client: DbClient) {
    const createdAfter = getEmailRateLimitQueryTime();
    const verificationCodes = await client.getUserVerificationCodes({
      userEntityId: this.entityId,
      createdAfter,
    });
    if (verificationCodes.length >= EMAIL_RATE_LIMITING_MAX_ATTEMPTS) {
      return false;
    }
    return true;
  }

  async getOrgMemberships(client: DbClient) {
    const outgoingMemberOfLinks = await this.getOutgoingLinks(client, {
      path: ["memberOf"],
    });

    return await Promise.all(
      outgoingMemberOfLinks.map(
        async ({ destinationAccountId, destinationEntityId }) => {
          const orgMembership = await OrgMembership.getOrgMembershipById(
            client,
            {
              accountId: destinationAccountId,
              entityId: destinationEntityId,
            },
          );

          if (!orgMembership) {
            throw new Error(
              `User with entityId ${this.entityId} links to membership with entityId ${destinationEntityId} that cannot be found`,
            );
          }

          return orgMembership;
        },
      ),
    );
  }

  async isMemberOfOrg(client: DbClient, orgEntityId: string) {
    const orgMemberships = await this.getOrgMemberships(client);

    for (const orgMembership of orgMemberships) {
      if ((await orgMembership.getOrg(client)).entityId === orgEntityId) {
        return true;
      }
    }

    return false;
  }

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  async joinOrg(
    client: DbClient,
    params: { org: Org; responsibility: string; updatedByAccountId: string },
  ) {
    if (await this.isMemberOfOrg(client, params.org.entityId)) {
      throw new Error(
        `User with entityId '${this.entityId}' is already a member of the organization with entityId '${params.org.entityId}'`,
      );
    }

    const { org, responsibility } = params;

    const orgMembership = await OrgMembership.createOrgMembership(client, {
      responsibility,
      org,
      user: this,
    });

    /** @todo: remove this when inverse relationships are automatically created */
    await Promise.all([
      this.createOutgoingLink(client, {
        createdByAccountId: this.accountId,
        stringifiedPath: Link.stringifyPath(["memberOf"]),
        destination: orgMembership,
      }),
      org.createOutgoingLink(client, {
        createdByAccountId: this.accountId,
        stringifiedPath: Link.stringifyPath(["membership"]),
        destination: orgMembership,
      }),
    ]);

    return this;
  }
}

export default __User;
