import { ApolloError } from "apollo-server-errors";
import {
  Org,
  Account,
  AccountConstructorArgs,
  OrgInvitationLink,
  OrgEmailInvitation,
  OrgMembership,
  User,
  UpdatePropertiesPayload,
  PartialPropertiesUpdatePayload,
} from ".";
import { DbClient } from "../db";
import { DbOrgProperties, EntityType } from "../db/adapter";
import { genId } from "../util";

type OrgConstructorArgs = {
  properties: DbOrgProperties;
} & Omit<AccountConstructorArgs, "type">;

class __Org extends Account {
  properties: DbOrgProperties;

  constructor({ properties, ...remainingArgs }: OrgConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
  }

  static async getEntityType(client: DbClient): Promise<EntityType> {
    const orgEntityType = await client.getSystemTypeLatestVersion({
      systemTypeName: "Org",
    });
    return orgEntityType;
  }

  static async getOrgById(
    client: DbClient,
    params: { entityId: string },
  ): Promise<Org | null> {
    const { entityId } = params;
    const dbOrg = await client.getEntityLatestVersion({
      accountId: entityId,
      entityId,
    });

    return dbOrg ? new Org(dbOrg) : null;
  }

  static async getOrgByShortname(
    client: DbClient,
    params: { shortname: string },
  ): Promise<Org | null> {
    const { shortname } = params;
    const dbUser = await client.getOrgByShortname({ shortname });

    return dbUser ? new Org(dbUser) : null;
  }

  static async createOrg(
    client: DbClient,
    params: {
      createdByAccountId: string;
      properties: DbOrgProperties;
    },
  ): Promise<Org> {
    const { properties, createdByAccountId } = params;

    const id = genId();

    const entity = await client.createEntity({
      accountId: id,
      entityId: id,
      createdByAccountId,
      properties,
      entityTypeId: (await Org.getEntityType(client)).entityId,
      versioned: false, // @todo: should Org's be versioned?
    });

    const org = new Org(entity);

    await OrgInvitationLink.createOrgInvitationLink(client, {
      org,
      createdByAccountId,
    });

    return org;
  }

  async partialPropertiesUpdate(
    client: DbClient,
    params: PartialPropertiesUpdatePayload<DbOrgProperties>,
  ) {
    return super.partialPropertiesUpdate(client, params);
  }

  async updateProperties(
    client: DbClient,
    params: UpdatePropertiesPayload<DbOrgProperties>,
  ) {
    await super.updateProperties(client, params);
    this.properties = params.properties;
    return params.properties;
  }

  async getOrgMemberships(client: DbClient): Promise<OrgMembership[]> {
    const outgoingMembershipLinks = await this.getOutgoingLinks(client, {
      path: ["membership"],
    });

    return await Promise.all(
      outgoingMembershipLinks.map(
        async ({ destinationAccountId, destinationEntityId }) => {
          const orgMembership = await OrgMembership.getOrgMembershipById(
            client,
            {
              accountId: destinationAccountId,
              entityId: destinationEntityId,
            },
          );

          if (!orgMembership) {
            throw new Error(
              `Org with entityId ${this.entityId} links to membership with entityId ${destinationEntityId} that cannot be found`,
            );
          }

          return orgMembership;
        },
      ),
    );
  }

  async getOrgMembers(client: DbClient): Promise<User[]> {
    const orgMemberships = await this.getOrgMemberships(client);

    return Promise.all(
      orgMemberships.map((orgMembership) => orgMembership.getUser(client)),
    );
  }

  /**
   * @returns all invitations associated with the organization
   */
  async getInvitationLinks(client: DbClient): Promise<OrgInvitationLink[]> {
    /** @todo: query for invitations with correct outgoing 'org' relationships */
    const dbEntities = await client.getEntitiesBySystemType({
      accountId: this.accountId,
      systemTypeName: "OrgInvitationLink",
    });

    return dbEntities.map((entity) => new OrgInvitationLink(entity));
  }

  /**
   * @returns the invitation associated with the organization that has a matching token, or null.
   */
  async getInvitationLinkWithToken(
    client: DbClient,
    params: {
      invitationLinkToken: string;
      errorCodePrefix?: string;
    },
  ): Promise<OrgInvitationLink> {
    const { invitationLinkToken, errorCodePrefix } = params;

    const invitationLinks = await this.getInvitationLinks(client);

    const invitationLink = invitationLinks.find(
      ({ properties }) => properties.accessToken === invitationLinkToken,
    );

    if (!invitationLink) {
      const msg = `The invitation with token ${invitationLinkToken} associated with org with entityId ${this.entityId} could not be found in the datastore.`;
      throw new ApolloError(msg, `${errorCodePrefix}NOT_FOUND`);
    }

    invitationLink.validate(errorCodePrefix);

    return invitationLink;
  }

  /**
   * @returns all email invitations associated with the organization.
   */
  async getEmailInvitations(client: DbClient): Promise<OrgEmailInvitation[]> {
    /** @todo: query for email invitations with correct outgoing 'org' relationships */
    const dbEntities = await client.getEntitiesBySystemType({
      accountId: this.accountId,
      systemTypeName: "OrgEmailInvitation",
    });

    return dbEntities.map((entity) => new OrgEmailInvitation(entity));
  }

  /**
   * @returns the email invitation associated with the organization that has a matching token, or null.
   */
  async getEmailInvitationWithToken(
    client: DbClient,
    params: {
      invitationEmailToken: string;
      errorCodePrefix?: string;
    },
  ): Promise<OrgEmailInvitation> {
    const { invitationEmailToken, errorCodePrefix } = params;

    const emailInvitations = await this.getEmailInvitations(client);

    const emailInvitation = emailInvitations.find(
      ({ properties }) => properties.accessToken === invitationEmailToken,
    );

    if (!emailInvitation) {
      const msg = `The email invitation with token ${invitationEmailToken} associated with org with entityId ${this.entityId} could not be found in the datastore.`;
      throw new ApolloError(msg, `${errorCodePrefix}NOT_FOUND`);
    }

    emailInvitation.validate(errorCodePrefix);

    return emailInvitation;
  }
}

export default __Org;
