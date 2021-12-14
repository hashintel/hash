import { ApolloError } from "apollo-server-errors";
import { DBClient } from "../db";
import { DBLinkedEntity, EntityType } from "../db/adapter";
import {
  AccessToken,
  OrgEmailInvitation,
  DBAccessTokenProperties,
  AccessTokenConstructorArgs,
  Org,
  User,
  UpdatePropertiesPayload,
} from ".";
import { sendOrgEmailInvitationToEmailAddress } from "../email";
import { EmailTransporter } from "../email/transporters";

export type DBOrgEmailInvitationProperties = {
  inviter: DBLinkedEntity;
  inviteeEmailAddress: string;
  usedAt?: string;
  org: DBLinkedEntity;
} & DBAccessTokenProperties;

type OrgEmailInvitationConstructorArgs = {
  properties: DBOrgEmailInvitationProperties;
} & AccessTokenConstructorArgs;

class __OrgEmailInvitation extends AccessToken {
  properties: DBOrgEmailInvitationProperties;

  errorMsgPrefix: string;

  constructor({
    properties,
    ...remainingArgs
  }: OrgEmailInvitationConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
    this.errorMsgPrefix = `The email invitation with entityId ${this.entityId} associated with org with entityId ${this.properties.org.__linkedData.entityId}`;
  }

  static async getEntityType(client: DBClient): Promise<EntityType> {
    const dbEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "OrgEmailInvitation",
    });
    return dbEntityType;
  }

  /**
   * Creates an email invitation for an organization, and sends an invitation email to the invitee.
   * @param {Org} org - The organisation the invitation is associated with.
   * @param {User} inviter - The user that created the invitation.
   * @param {string} inviteeEmailAddress - The email address that will receive the invitation.
   */
  static async createOrgEmailInvitation(
    client: DBClient,
    emailTransporter: EmailTransporter,
    params: {
      org: Org;
      inviter: User;
      inviteeEmailAddress: string;
    },
  ): Promise<OrgEmailInvitation> {
    const { org, inviter, inviteeEmailAddress } = params;

    const properties: DBOrgEmailInvitationProperties = {
      inviteeEmailAddress /** @todo: validate email address */,
      accessToken: AccessToken.generateAccessToken(),
      org: org.convertToDBLink(),
      inviter: inviter.convertToDBLink(),
    };

    const entity = await client.createEntity({
      accountId: org.accountId,
      createdByAccountId: org.entityId,
      entityTypeId: (await OrgEmailInvitation.getEntityType(client)).entityId,
      properties,
      versioned: false,
    });

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
    client: DBClient,
    params: UpdatePropertiesPayload<any>,
  ) {
    await super.updateProperties(client, params);
    this.properties = params.properties;
    return params.properties;
  }

  /**
   * Sets the email invitation to used.
   */
  use(client: DBClient, updatedByAccountId: string) {
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
