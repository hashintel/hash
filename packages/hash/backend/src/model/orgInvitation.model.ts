import { DBClient } from "../db";
import { DBLinkedEntity, EntityType } from "../db/adapter";
import {
  AccessToken,
  OrgInvitation,
  DBAccessTokenProperties,
  AccessTokenConstructorArgs,
  Org,
} from ".";

export type DBOrgInvitationProperties = {
  useCount: number;
  org: DBLinkedEntity;
} & DBAccessTokenProperties;

type OrgInvitationConstructorArgs = {
  properties: DBOrgInvitationProperties;
} & AccessTokenConstructorArgs;

class __OrgInvitation extends AccessToken {
  properties: DBOrgInvitationProperties;

  constructor({ properties, ...remainingArgs }: OrgInvitationConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
  }

  static getEntityType = async (client: DBClient): Promise<EntityType> =>
    client
      .getSystemTypeLatestVersion({ systemTypeName: "OrgInvitation" })
      .then((entityType) => {
        if (!entityType) {
          throw new Error(
            "OrgInvitation system entity type not found in datastore"
          );
        }

        return entityType;
      });

  /**
   * Create an org invitation.
   * @param {Org} org - The organisation the invitation is associated with.
   */
  static createOrgInvitation =
    (client: DBClient) =>
    async (params: { org: Org }): Promise<OrgInvitation> => {
      const { org } = params;

      const properties: DBOrgInvitationProperties = {
        useCount: 0,
        accessToken: AccessToken.generateAccessToken(),
        org: org.convertToDBLink(),
      };

      const entity = await client.createEntity({
        accountId: org.accountId,
        createdById: org.entityId,
        entityTypeId: (await OrgInvitation.getEntityType(client)).entityId,
        properties,
        versioned: false,
      });

      return new OrgInvitation({ ...entity, properties });
    };

  private updateOrgInvitationProperties =
    (client: DBClient) => (properties: DBOrgInvitationProperties) =>
      this.updateProperties(client)(properties);

  /**
   * Increment the use count of the invitation.
   */
  incrementUseCount = (client: DBClient) =>
    this.updateOrgInvitationProperties(client)({
      ...this.properties,
      useCount: this.properties.useCount + 1,
    });
}

export default __OrgInvitation;
