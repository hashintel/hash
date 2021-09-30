import { ApolloError } from "apollo-server-errors";
import {
  Org,
  Account,
  AccountConstructorArgs,
  OrgInvitationLink,
  OrgEmailInvitation,
} from ".";
import { DBClient } from "../db";
import { DBOrgProperties, EntityType } from "../db/adapter";
import { genId } from "../util";

type OrgConstructorArgs = {
  properties: DBOrgProperties;
} & Omit<AccountConstructorArgs, "type">;

class __Org extends Account {
  properties: DBOrgProperties;

  constructor({ properties, ...remainingArgs }: OrgConstructorArgs) {
    super({ ...remainingArgs, properties });
    this.properties = properties;
  }

  static getEntityType = async (client: DBClient): Promise<EntityType> =>
    client
      .getSystemTypeLatestVersion({ systemTypeName: "Org" })
      .then((OrgEntityType) => {
        if (!OrgEntityType) {
          throw new Error("Org system entity type not found in datastore");
        }

        return OrgEntityType;
      });

  static getOrgById =
    (client: DBClient) =>
    ({ entityId }: { entityId: string }): Promise<Org | null> =>
      client
        .getEntityLatestVersion({ accountId: entityId, entityId })
        .then((dbOrg) => (dbOrg ? new Org(dbOrg) : null));

  static getOrgByShortname =
    (client: DBClient) =>
    ({ shortname }: { shortname: string }): Promise<Org | null> =>
      client
        .getOrgByShortname({ shortname })
        .then((dbUser) => (dbUser ? new Org(dbUser) : null));

  static createOrg =
    (client: DBClient) =>
    async (params: {
      createdById: string;
      properties: DBOrgProperties;
    }): Promise<Org> => {
      const { properties, createdById } = params;

      const id = genId();

      const entity = await client.createEntity({
        accountId: id,
        entityId: id,
        createdById,
        properties,
        entityTypeId: (await Org.getEntityType(client)).entityId,
        versioned: false, // @todo: should Org's be versioned?
      });

      const org = new Org(entity);

      await OrgInvitationLink.createOrgInvitationLink(client)({
        org,
        createdById,
      });

      return org;
    };

  private updateOrgProperties =
    (client: DBClient) => (properties: DBOrgProperties) =>
      this.updateProperties(client)(properties);

  /**
   * @returns all invitations associated with the organization
   */
  getInvitationLinks = async (
    client: DBClient
  ): Promise<OrgInvitationLink[]> => {
    /** @todo: query for invitations with correct outgoing 'org' relationships */
    const dbEntities = await client.getEntitiesBySystemType({
      accountId: this.accountId,
      systemTypeName: "OrgInvitationLink",
    });

    return dbEntities.map((entity) => new OrgInvitationLink(entity));
  };

  /**
   * @returns the invitation associated with the organization that has a matching token, or null.
   */
  getInvitationLinkWithToken =
    (client: DBClient) =>
    async (params: {
      invitationLinkToken: string;
      errorCodePrefix?: string;
    }): Promise<OrgInvitationLink> => {
      const { invitationLinkToken, errorCodePrefix } = params;

      const invitationLinks = await this.getInvitationLinks(client);

      const invitationLink = invitationLinks.find(
        ({ properties }) => properties.accessToken === invitationLinkToken
      );

      if (!invitationLink) {
        const msg = `The invitation with token ${invitationLinkToken} associated with org with entityId ${this.entityId} could not be found in the datastore.`;
        throw new ApolloError(msg, `${errorCodePrefix}NOT_FOUND`);
      }

      invitationLink.validate(errorCodePrefix);

      return invitationLink;
    };

  /**
   * @returns all email invitations associated with the organization.
   */
  getEmailInvitations = async (
    client: DBClient
  ): Promise<OrgEmailInvitation[]> => {
    /** @todo: query for email invitations with correct outgoing 'org' relationships */
    const dbEntities = await client.getEntitiesBySystemType({
      accountId: this.accountId,
      systemTypeName: "OrgEmailInvitation",
    });

    return dbEntities.map((entity) => new OrgEmailInvitation(entity));
  };

  /**
   * @returns the email invitation associated with the organization that has a matching token, or null.
   */
  getEmailInvitationWithToken =
    (client: DBClient) =>
    async (params: {
      invitationEmailToken: string;
      errorCodePrefix?: string;
    }): Promise<OrgEmailInvitation> => {
      const { invitationEmailToken, errorCodePrefix } = params;

      const emailInvitations = await this.getEmailInvitations(client);

      const emailInvitation = emailInvitations.find(
        ({ properties }) => properties.accessToken === invitationEmailToken
      );

      if (!emailInvitation) {
        const msg = `The email invitation with token ${invitationEmailToken} associated with org with entityId ${this.entityId} could not be found in the datastore.`;
        throw new ApolloError(msg, `${errorCodePrefix}NOT_FOUND`);
      }

      emailInvitation.validate(errorCodePrefix);

      return emailInvitation;
    };
}

export default __Org;
