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
} from ".";
import { sendOrgEmailInvitationToEmailAddress } from "../email";
import EmailTransporter from "../email/transporter";

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

  static getEntityType = async (client: DBClient): Promise<EntityType> =>
    client
      .getSystemTypeLatestVersion({ systemTypeName: "OrgEmailInvitation" })
      .then((entityType) => {
        if (!entityType) {
          throw new Error(
            "OrgEmailInvitation system entity type not found in datastore"
          );
        }

        return entityType;
      });

  /**
   * Creates an email invitation for an organization, and sends an invitation email to the invitee.
   * @param {Org} org - The organisation the invitation is associated with.
   * @param {User} inviter - The user that created the invitation.
   * @param {string} inviteeEmailAddress - The email address that will receive the invitation.
   */
  static createOrgEmailInvitation =
    (client: DBClient, transporter: EmailTransporter) =>
    async (params: {
      org: Org;
      inviter: User;
      inviteeEmailAddress: string;
    }): Promise<OrgEmailInvitation> => {
      const { org, inviter, inviteeEmailAddress } = params;

      const properties: DBOrgEmailInvitationProperties = {
        inviteeEmailAddress /** @todo: validate email address */,
        accessToken: AccessToken.generateAccessToken(),
        org: org.convertToDBLink(),
        inviter: inviter.convertToDBLink(),
      };

      const entity = await client.createEntity({
        accountId: org.accountId,
        createdById: org.entityId,
        entityTypeId: (await OrgEmailInvitation.getEntityType(client)).entityId,
        properties,
        versioned: false,
      });

      const emailInvitation = new OrgEmailInvitation({ ...entity, properties });

      const existingUser = User.getUserByEmail(client)({
        email: inviteeEmailAddress,
        verified: true,
      });

      await sendOrgEmailInvitationToEmailAddress(transporter)({
        org,
        emailInvitation,
        isExistingUser: !!existingUser,
        emailAddress: inviteeEmailAddress,
      });

      return new OrgEmailInvitation({ ...entity, properties });
    };

  private updateOrgEmailInvitationProperties =
    (client: DBClient) => (properties: DBOrgEmailInvitationProperties) =>
      this.updateProperties(client)(properties);

  /**
   * Sets the email invitation to used.
   */
  use = (client: DBClient) => {
    if (this.hasBeenUsed()) {
      throw new Error(
        `OrgEmailInvitation with entityId ${this.entityId} has already been used`
      );
    }
    return this.updateOrgEmailInvitationProperties(client)({
      ...this.properties,
      revokedAt: new Date().toISOString(),
    });
  };

  /**
   * @returns whether the email invitation has already been used.
   */
  hasBeenUsed = (): boolean => !!this.properties.usedAt;

  validate = (errorCodePrefix?: string) => {
    if (this.hasBeenRevoked()) {
      const msg = `${this.errorMsgPrefix} has been revoked.`;
      throw new ApolloError(msg, `${errorCodePrefix}REVOKED`);
    }

    if (this.hasBeenUsed()) {
      const msg = `${this.errorMsgPrefix} has been used.`;
      throw new ApolloError(msg, `${errorCodePrefix}ALREADY_USED`);
    }
  };

  isValid = (): boolean => !this.hasBeenUsed() && !this.hasBeenRevoked();
}

export default __OrgEmailInvitation;
