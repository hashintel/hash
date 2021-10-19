import { ApolloError } from "apollo-server-errors";
import { DBClient } from "../db";
import { DBLinkedEntity, EntityType } from "../db/adapter";
import {
  AccessToken,
  OrgInvitationLink,
  DBAccessTokenProperties,
  AccessTokenConstructorArgs,
  Org,
} from ".";

export type DBOrgInvitationLinkProperties = {
  useCount: number;
  org: DBLinkedEntity;
} & DBAccessTokenProperties;

type OrgInvitationLinkConstructorArgs = {
  properties: DBOrgInvitationLinkProperties;
} & AccessTokenConstructorArgs;

class __OrgInvitationLink extends AccessToken {
  properties: DBOrgInvitationLinkProperties;
  errorMsgPrefix: string;

  constructor({
    properties,
    ...remainingArgs
  }: OrgInvitationLinkConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
    this.errorMsgPrefix = `The invitation link with entityId ${this.entityId} associated with org with entityId ${this.properties.org.__linkedData.entityId}`;
  }

  static getEntityType = async (client: DBClient): Promise<EntityType> =>
    client
      .getSystemTypeLatestVersion({ systemTypeName: "OrgInvitationLink" })
      .then((entityType) => {
        if (!entityType) {
          throw new Error(
            "OrgInvitationLink system entity type not found in datastore"
          );
        }

        return entityType;
      });

  /**
   * Create an org invitation.
   * @param {Org} org - The organisation the invitation is associated with.
   */
  static createOrgInvitationLink =
    (client: DBClient) =>
    async (params: {
      org: Org;
      createdById: string;
    }): Promise<OrgInvitationLink> => {
      const { org, createdById } = params;

      const properties: DBOrgInvitationLinkProperties = {
        useCount: 0,
        accessToken: AccessToken.generateAccessToken(),
        org: org.convertToDBLink(),
      };

      const entity = await client.createEntity({
        accountId: org.accountId,
        createdById,
        entityTypeId: (await OrgInvitationLink.getEntityType(client)).entityId,
        properties,
        versioned: false,
      });

      const orgInvitationLink = new OrgInvitationLink({
        ...entity,
        properties,
      });

      /**
       * @todo: remove this when we have a way of resolving the inverse
       * relationship of (OrgInvitationLink)-[org]->(Org)
       */

      org.properties.invitationLink = orgInvitationLink.convertToDBLink();

      return orgInvitationLink;
    };

  updateProperties(client: DBClient) {
    return (properties: DBOrgInvitationLinkProperties) =>
      super
        .updateProperties(client)(properties)
        .then(() => {
          this.properties = properties;
          return properties;
        });
  }

  /**
   * Increments the use count of the invitation.
   */
  use = (client: DBClient) =>
    this.updateProperties(client)({
      ...this.properties,
      useCount: this.properties.useCount + 1,
    });

  validate = (errorCodePrefix?: string) => {
    if (this.hasBeenRevoked()) {
      const msg = `${this.errorMsgPrefix} has been revoked.`;
      throw new ApolloError(msg, `${errorCodePrefix}REVOKED`);
    }
  };
}

export default __OrgInvitationLink;
