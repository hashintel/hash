import { DBClient } from "../db";
import { EntityType } from "../db/adapter";
import { genId } from "../util";
import { OrgProperties, Org as GQLOrg } from "../graphql/apiTypes.gen";
import Entity, { EntityConstructorArgs } from "./entity.model";

type OrgConstructorArgs = {
  properties: OrgProperties;
} & Omit<EntityConstructorArgs, "type">;

class Org extends Entity {
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

      const entity = await Entity.create(client)({
        accountId: id,
        entityVersionId: id,
        createdById: id, // Orgs "create" themselves
        entityTypeId: (await Org.getEntityType(client)).entityId,
        properties,
        versioned: false, // @todo: should Org's be versioned?
      });

      return new Org(entity);
    };

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  private updateOrgProperties =
    (client: DBClient) => (properties: OrgProperties) =>
      this.updateProperties(client)(properties);

  toGQLOrg = (): GQLOrg => ({
    ...this.toGQLUnknownEntity(),
    __typename: "Org",
  });
}

export default Org;
