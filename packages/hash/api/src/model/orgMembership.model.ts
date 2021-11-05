import { OrgMembership, Account, AccountConstructorArgs, User, Org } from ".";
import { DBClient } from "../db";
import { DBOrgMembershipProperties, EntityType } from "../db/adapter";
import { genId } from "../util";

type OrgMembershipModelProperties = DBOrgMembershipProperties;

type OrgMembershipConstructorArgs = {
  properties: OrgMembershipModelProperties;
} & Omit<AccountConstructorArgs, "type">;

class __OrgMembership extends Account {
  properties: OrgMembershipModelProperties;

  constructor({ properties, ...remainingArgs }: OrgMembershipConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
  }

  static async getEntityType(client: DBClient): Promise<EntityType> {
    const orgMembershipEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "OrgMembership",
    });

    if (!orgMembershipEntityType) {
      throw new Error(
        "OrgMembership system entity type not found in datastore",
      );
    }

    return orgMembershipEntityType;
  }

  static async getOrgMembershipById(
    client: DBClient,
    params: { accountId: string; entityId: string },
  ): Promise<OrgMembership | null> {
    const dbOrgMembership = await client.getEntityLatestVersion(params);

    return dbOrgMembership ? new OrgMembership(dbOrgMembership) : null;
  }

  static async createOrgMembership(
    client: DBClient,
    params: {
      responsibility: string;
      user: User;
      org: Org;
    },
  ): Promise<OrgMembership> {
    const { org, user, responsibility } = params;

    const id = genId();

    const properties: DBOrgMembershipProperties = {
      org: org.convertToDBLink(),
      user: user.convertToDBLink(),
      responsibility,
    };

    const entity = await client.createEntity({
      accountId: org.entityId,
      entityId: id,
      createdById: org.entityId,
      properties,
      entityTypeId: (await OrgMembership.getEntityType(client)).entityId,
      versioned: false, // @todo: should OrgMembership's be versioned?
    });

    const orgMembership = new OrgMembership(entity);

    return orgMembership;
  }

  async updateProperties(
    client: DBClient,
    properties: DBOrgMembershipProperties,
  ) {
    await super.updateProperties(client, properties);
    this.properties = properties;
    return properties;
  }
}

export default __OrgMembership;
