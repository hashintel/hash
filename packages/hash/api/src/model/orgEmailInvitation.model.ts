import { ApolloError } from "apollo-server-errors";
import { DbClient } from "../db";
import { EntityType } from "../db/adapter";
import {
  AccessToken,
  OrgEmailInvitation,
  DbAccessTokenProperties,
  AccessTokenConstructorArgs,
  Org,
  User,
  UpdatePropertiesPayload,
  Entity,
  Link,
} from ".";
import { sendOrgEmailInvitationToEmailAddress } from "../email";
import { EmailTransporter } from "../email/transporters";

export type DbOrgEmailInvitationProperties = {
  inviteeEmailAddress: string;
  usedAt?: string;
} & DbAccessTokenProperties;

type OrgEmailInvitationConstructorArgs = {
  properties: DbOrgEmailInvitationProperties;
} & AccessTokenConstructorArgs;

class __OrgEmailInvitation extends AccessToken {
  properties: DbOrgEmailInvitationProperties;

  errorMsgPrefix: string;

  constructor({
    properties,
    ...remainingArgs
  }: OrgEmailInvitationConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
    this.errorMsgPrefix = `The email invitation with entityId ${this.entityId} `;
  }

  static async getEntityType(client: DbClient): Promise<EntityType> {
    const dbEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "OrgEmailInvitation",
    });
    return dbEntityType;
  }

  static async getOrgEmailInvitation(
    client: DbClient,
    params: { accountId: string; entityId: string },
  ): Promise<OrgEmailInvitation | null> {
    const dbOrgEmailInvitation = await client.getEntityLatestVersion(params);

    return dbOrgEmailInvitation
      ? new OrgEmailInvitation(dbOrgEmailInvitation)
      : null;
  }

  /**
   * Creates an email invitation for an organization, and sends an invitation email to the invitee.
   * @param {Org} org - The organisation the invitation is associated with.
   * @param {User} inviter - The user that created the invitation.
   * @param {string} inviteeEmailAddress - The email address that will receive the invitation.
   */
  static async createOrgEmailInvitation(
    client: DbClient,
    emailTransporter: EmailTransporter,
    params: {
      org: Org;
      inviter: User;
      inviteeEmailAddress: string;
    },
  ): Promise<OrgEmailInvitation> {
    const { org, inviter, inviteeEmailAddress } = params;

    const properties: DbOrgEmailInvitationProperties = {
      inviteeEmailAddress /** @todo: validate email address */,
      accessToken: AccessToken.generateAccessToken(),
    };

    const entity = await Entity.create(client, {
      accountId: org.accountId,
      createdByAccountId: org.entityId,
      entityTypeId: (await OrgEmailInvitation.getEntityType(client)).entityId,
      properties,
      versioned: false,
    });

    await Promise.all([
      entity.createOutgoingLink(client, {
        createdByAccountId: inviter.accountId,
        destination: org,
        stringifiedPath: Link.stringifyPath(["org"]),
      }),
      /** @todo: remove this when inverse relationships are automatically created */
      org.createOutgoingLink(client, {
        createdByAccountId: inviter.accountId,
        destination: entity,
        stringifiedPath: Link.stringifyPath(["emailInvitationLink"]),
      }),
      entity.createOutgoingLink(client, {
        createdByAccountId: inviter.accountId,
        destination: inviter,
        stringifiedPath: Link.stringifyPath(["inviter"]),
      }),
    ]);

    const emailInvitation = new OrgEmailInvitation({ ...entity, properties });

    const existingUser = await User.getUserByEmail(client, {
      email: inviteeEmailAddress,
      verified: true,
    });

    await sendOrgEmailInvitationToEmailAddress(emailTransporter)({
      org,
      emailInvitation,
      isExistingUser: !!existingUser,
      emailAddress: inviteeEmailAddress,
    });

    return new OrgEmailInvitation({ ...entity, properties });
  }

  async updateProperties(
    client: DbClient,
    params: UpdatePropertiesPayload<any>,
  ) {
    await super.updateProperties(client, params);
    this.properties = params.properties;
    return params.properties;
  }

  async getOrg(client: DbClient): Promise<Org> {
    const outgoingOrgLinks = await this.getOutgoingLinks(client, {
      path: ["org"],
    });

    const orgLink = outgoingOrgLinks[0];

    if (!orgLink) {
      throw new Error(
        `OrgEmailInvitation with entityId ${this.entityId} does not have an outgoing org link`,
      );
    }

    const { destinationEntityId } = orgLink;

    const org = await Org.getOrgById(client, {
      entityId: destinationEntityId,
    });

    if (!org) {
      throw new Error(
        `OrgEmailInvitation with entityId ${this.entityId} links to org with entityId ${destinationEntityId} that cannot be found`,
      );
    }

    return org;
  }

  async getInviter(client: DbClient): Promise<User> {
    const outgoingInviterLinks = await this.getOutgoingLinks(client, {
      path: ["inviter"],
    });

    const inviterLink = outgoingInviterLinks[0];

    if (!inviterLink) {
      throw new Error(
        `OrgEmailInvitation with entityId ${this.entityId} does not have an outgoing inviter link`,
      );
    }

    const { destinationEntityId } = inviterLink;

    const inviter = await User.getUserById(client, {
      entityId: destinationEntityId,
    });

    if (!inviter) {
      throw new Error(
        `OrgEmailInvitation with entityId ${this.entityId} links to org with entityId ${destinationEntityId} that cannot be found`,
      );
    }

    return inviter;
  }

  /**
   * Sets the email invitation to used.
   */
  use(client: DbClient, updatedByAccountId: string) {
    if (this.hasBeenUsed()) {
      throw new Error(
        `OrgEmailInvitation with entityId ${this.entityId} has already been used`,
      );
    }
    return this.partialPropertiesUpdate(client, {
      updatedByAccountId,
      properties: {
        revokedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * @returns whether the email invitation has already been used.
   */
  hasBeenUsed(): boolean {
    return !!this.properties.usedAt;
  }

  validate(errorCodePrefix?: string) {
    if (this.hasBeenRevoked()) {
      const msg = `${this.errorMsgPrefix} has been revoked.`;
      throw new ApolloError(msg, `${errorCodePrefix}REVOKED`);
    }

    if (this.hasBeenUsed()) {
      const msg = `${this.errorMsgPrefix} has been used.`;
      throw new ApolloError(msg, `${errorCodePrefix}ALREADY_USED`);
    }
  }

  isValid(): boolean {
    return !this.hasBeenUsed() && !this.hasBeenRevoked();
  }
}

export default __OrgEmailInvitation;
