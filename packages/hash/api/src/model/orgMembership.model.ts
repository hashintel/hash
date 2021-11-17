import {
  OrgMembership,
  AccountConstructorArgs,
  User,
  Org,
  UpdatePropertiesPayload,
  Entity,
  Link,
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

    await Promise.all([
      orgMembership.createOutgoingLink(client, {
        stringifiedPath: Link.stringifyPath(["user"]),
        destination: user,
      }),
      orgMembership.createOutgoingLink(client, {
        stringifiedPath: Link.stringifyPath(["org"]),
        destination: org,
      }),
    ]);

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
    const outgoingUserLinks = await this.getOutgoingLinks(client, {
      path: ["user"],
    });

    const userLink = outgoingUserLinks[0];

    if (!userLink) {
      throw new Error(
        `OrgMembership with entityId ${this.entityId} does not have an outgoing user link`,
      );
    }

    const { destinationEntityId } = userLink;

    const user = await User.getUserById(client, {
      entityId: destinationEntityId,
    });

    if (!user) {
      throw new Error(
        `OrgMembership with entityId ${this.entityId} links to user with entityId ${destinationEntityId} that cannot be found`,
      );
    }

    return user;
  }

  async getOrg(client: DBClient): Promise<Org> {
    const outgoingOrgLinks = await this.getOutgoingLinks(client, {
      path: ["org"],
    });

    const orgLink = outgoingOrgLinks[0];

    if (!orgLink) {
      throw new Error(
        `OrgMembership with entityId ${this.entityId} does not have an outgoing org link`,
      );
    }

    const { destinationEntityId } = orgLink;

    const org = await Org.getOrgById(client, {
      entityId: destinationEntityId,
    });

    if (!org) {
      throw new Error(
        `OrgMembership with entityId ${this.entityId} links to org with entityId ${destinationEntityId} that cannot be found`,
      );
    }

    return org;
  }
}

export default __OrgMembership;
