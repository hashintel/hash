import { Org, Account, AccountConstructorArgs } from ".";
import { DBClient } from "../db";
import { EntityType } from "../db/adapter";
import { genId } from "../util";
import { OrgProperties } from "../graphql/apiTypes.gen";

type OrgConstructorArgs = {
  properties: OrgProperties;
} & Omit<AccountConstructorArgs, "type">;

class __Org extends Account {
  properties: OrgProperties;

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
    ({
      accountId,
      entityId,
    }: {
      accountId: string;
      entityId: string;
    }): Promise<Org | null> =>
      client
        .getEntityLatestVersion({ accountId, entityId })
        .then((dbOrg) => (dbOrg ? new Org(dbOrg) : null));

  static getOrgByShortname =
    (client: DBClient) =>
    ({ shortname }: { shortname: string }): Promise<Org | null> =>
      client
        .getOrgByShortname({ shortname })
        .then((dbUser) => (dbUser ? new Org(dbUser) : null));

  static createOrg =
    (client: DBClient) =>
    async (properties: OrgProperties): Promise<Org> => {
      const id = genId();

      const entity = await client.createEntity({
        accountId: id,
        entityVersionId: id,
        createdById: id, // Orgs "create" themselves
        entityTypeId: (await Org.getEntityType(client)).entityId,
        properties,
        versioned: false, // @todo: should Org's be versioned?
      });

      return new Org(entity);
    };

  private updateOrgProperties =
    (client: DBClient) => (properties: OrgProperties) =>
      this.updateProperties(client)(properties);
}

export default __Org;
