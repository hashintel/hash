import { ApolloError } from "apollo-server-errors";
import { DBClient } from "../db";
import { EntityType } from "../db/adapter";
import {
  AccessToken,
  OrgInvitationLink,
  DBAccessTokenProperties,
  AccessTokenConstructorArgs,
  Org,
  UpdatePropertiesPayload,
  Entity,
  Link,
} from ".";

export type DBOrgInvitationLinkProperties = {
  useCount: number;
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
    this.errorMsgPrefix = `The invitation link with entityId ${this.entityId}`;
  }

  static async getEntityType(client: DBClient): Promise<EntityType> {
    const dbEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "OrgInvitationLink",
    });
    return dbEntityType;
  }

  static async getOrgInvitationLink(
    client: DBClient,
    params: { accountId: string; entityId: string },
  ): Promise<OrgInvitationLink | null> {
    const dbOrgInvitationLink = await client.getEntityLatestVersion(params);

    return dbOrgInvitationLink
      ? new OrgInvitationLink(dbOrgInvitationLink)
      : null;
  }

  /**
   * Create an org invitation.
   * @param {Org} org - The organisation the invitation is associated with.
   */
  static async createOrgInvitationLink(
    client: DBClient,
    params: {
      org: Org;
      createdByAccountId: string;
    },
  ): Promise<OrgInvitationLink> {
    const { org, createdByAccountId } = params;

    const properties: DBOrgInvitationLinkProperties = {
      useCount: 0,
      accessToken: AccessToken.generateAccessToken(),
    };

    const entity = await Entity.create(client, {
      accountId: org.accountId,
      createdByAccountId,
      entityTypeId: (await OrgInvitationLink.getEntityType(client)).entityId,
      properties,
      versioned: false,
    });

    await Promise.all([
      entity.createOutgoingLink(client, {
        createdByAccountId,
        destination: org,
        stringifiedPath: Link.stringifyPath(["org"]),
      }),
      /** @todo: remove this when inverse relationships are automatically created */
      org.createOutgoingLink(client, {
        createdByAccountId,
        destination: entity,
        stringifiedPath: Link.stringifyPath(["invitationLink"]),
      }),
    ]);

    const orgInvitationLink = new OrgInvitationLink({
      ...entity,
      properties,
    });

    return orgInvitationLink;
  }

  async getOrg(client: DBClient): Promise<Org> {
    const outgoingOrgLinks = await this.getOutgoingLinks(client, {
      path: ["org"],
    });

    const orgLink = outgoingOrgLinks[0];

    if (!orgLink) {
      throw new Error(
        `OrgInvitationLink with entityId ${this.entityId} does not have an outgoing org link`,
      );
    }

    const { destinationEntityId } = orgLink;

    const org = await Org.getOrgById(client, {
      entityId: destinationEntityId,
    });

    if (!org) {
      throw new Error(
        `OrgInvitationLink with entityId ${this.entityId} links to org with entityId ${destinationEntityId} that cannot be found`,
      );
    }

    return org;
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
   * Increments the use count of the invitation.
   */
  use(client: DBClient, updatedByAccountId: string) {
    return this.partialPropertiesUpdate(client, {
      updatedByAccountId,
      properties: {
        useCount: this.properties.useCount + 1,
      },
    } as any);
  }

  validate(errorCodePrefix?: string) {
    if (this.hasBeenRevoked()) {
      const msg = `${this.errorMsgPrefix} has been revoked.`;
      throw new ApolloError(msg, `${errorCodePrefix}REVOKED`);
    }
  }
}

export default __OrgInvitationLink;
