import {
  OrgMembership,
  AccountConstructorArgs,
  User,
  Org,
  UpdatePropertiesPayload,
  Entity,
} from ".";
import { DBClient } from "../db";
import { DBOrgMembershipProperties, EntityType } from "../db/adapter";
import { genId } from "../util";

type OrgMembershipModelProperties = DBOrgMembershipProperties;

type OrgMembershipConstructorArgs = {
  properties: OrgMembershipModelProperties;
} & Omit<AccountConstructorArgs, "type">;

class __OrgMembership extends Entity {
  properties: OrgMembershipModelProperties;

  constructor({ properties, ...remainingArgs }: OrgMembershipConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
  }

  static async getEntityType(client: DBClient): Promise<EntityType> {
    const orgMembershipEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "OrgMembership",
    });
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
      createdByAccountId: org.entityId,
      properties,
      entityTypeId: (await OrgMembership.getEntityType(client)).entityId,
      versioned: false, // @todo: should OrgMembership's be versioned?
    });

    const orgMembership = new OrgMembership(entity);

    return orgMembership;
  }

  // Have to use properties as any because `OrgMembership` inherits from `Account` even though their properties are very different and not compatible
  async updateProperties(
    client: DBClient,
    params: UpdatePropertiesPayload<DBOrgMembershipProperties>,
  ) {
    await super.updateProperties(client, params);
    this.properties = params.properties;
    return params.properties;
  }

  async getUser(client: DBClient): Promise<User> {
    const { entityId } = this.properties.user.__linkedData;

    const user = await User.getUserById(client, {
      entityId,
    });

    if (!user) {
      throw new Error(
        `OrgMembership with entityId ${this.entityId} links to user with entityId ${entityId} that cannot be found`,
      );
    }

    return user;
  }

  async getOrg(client: DBClient): Promise<Org> {
    const { entityId } = this.properties.org.__linkedData;

    const org = await Org.getOrgById(client, {
      entityId,
    });

    if (!org) {
      throw new Error(
        `OrgMembership with entityId ${this.entityId} links to org with entityId ${entityId} that cannot be found`,
      );
    }

    return org;
  }
}

export default __OrgMembership;
