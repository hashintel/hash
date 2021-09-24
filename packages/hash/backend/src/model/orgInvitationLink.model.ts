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

  constructor({
    properties,
    ...remainingArgs
  }: OrgInvitationLinkConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
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
    async (params: { org: Org }): Promise<OrgInvitationLink> => {
      const { org } = params;

      const properties: DBOrgInvitationLinkProperties = {
        useCount: 0,
        accessToken: AccessToken.generateAccessToken(),
        org: org.convertToDBLink(),
      };

      const entity = await client.createEntity({
        accountId: org.accountId,
        createdById: org.entityId,
        entityTypeId: (await OrgInvitationLink.getEntityType(client)).entityId,
        properties,
        versioned: false,
      });

      return new OrgInvitationLink({ ...entity, properties });
    };

  private updateOrgInvitationLinkProperties =
    (client: DBClient) => (properties: DBOrgInvitationLinkProperties) =>
      this.updateProperties(client)(properties);

  /**
   * Increments the use count of the invitation.
   */
  use = (client: DBClient) =>
    this.updateOrgInvitationLinkProperties(client)({
      ...this.properties,
      useCount: this.properties.useCount + 1,
    });
}

export default __OrgInvitationLink;
