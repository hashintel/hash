import { EntityType } from ".";
import { DBClient } from "../db";
import {
  EntityType as GQLEntityType,
  UnknownEntity as GQLUnknownEntity,
  Visibility,
} from "../graphql/apiTypes.gen";
import { JSONObject } from "../lib/schemas/jsonSchema";

/**
 * Fields we handle via a field resolver to avoid recursion problems when getting them from the db.
 * Let the API consumers request as many levels as they want.
 * @todo figure out a solution to recursion issue of an entityType having itself as an entityType
 */
export type EntityTypeTypeFields =
  | "entityType"
  | "entityTypeId"
  | "entityTypeName"
  | "entityTypeVersionId";

/**
 * We handle the various entityType fields for an entityType in separate field resolvers,
 * to allow consumers to recursively request the entityType of an entityType, and so on.
 */
export type EntityTypeWithoutTypeFields = Omit<
  GQLEntityType,
  EntityTypeTypeFields
>;

/**
 * Because we handle certain fields on an EntityTypes via their own field resolvers,
 * the entityType property on each Entity is not an exact match for the final GraphQL definition.
 * This type represents an Entity with a partially populated entityType field.
 */
export type EntityWithIncompleteEntityType = Omit<
  GQLUnknownEntity,
  "entityType" | "__typename"
> & { entityType: EntityTypeWithoutTypeFields };

export type EntityTypeConstructorArgs = {
  entityId: string;
  entityVersionId: string;
  createdById: string;
  accountId: string;
  properties: JSONObject;
  entityCreatedAt: Date;
  entityVersionCreatedAt: Date;
  entityVersionUpdatedAt: Date;
};

// This is a bit repetitive of Entity, but we don't want the methods on Entity available on this
class __EntityType {
  entityId: string;
  entityVersionId: string;
  createdById: string;
  accountId: string;
  properties: JSONObject;
  entityCreatedAt: Date;
  entityVersionCreatedAt: Date;
  entityVersionUpdatedAt: Date;

  constructor({
    entityId,
    entityVersionId,
    createdById,
    accountId,
    properties,
    entityCreatedAt,
    entityVersionCreatedAt,
    entityVersionUpdatedAt,
  }: EntityTypeConstructorArgs) {
    this.entityId = entityId;
    this.entityVersionId = entityVersionId;
    this.createdById = createdById;
    this.accountId = accountId;
    this.properties = properties;
    this.entityCreatedAt = entityCreatedAt;
    this.entityVersionCreatedAt = entityVersionCreatedAt;
    this.entityVersionUpdatedAt = entityVersionUpdatedAt;
  }

  static create =
    (db: DBClient) =>
    async (args: {
      accountId: string;
      createdById: string;
      description?: string | null;
      name: string;
      schema?: JSONObject | null;
    }): Promise<EntityType> => {
      const { accountId, createdById, description, schema, name } = args;

      const entityType = await db.createEntityType({
        accountId,
        createdById,
        description,
        name,
        schema,
      });

      return new EntityType(entityType);
    };

  static getEntityType = async (db: DBClient) =>
    db
      .getSystemTypeLatestVersion({ systemTypeName: "EntityType" })
      .then((entityTypeType) => {
        if (!entityTypeType) {
          throw new Error(
            "EntityType system entity type not found in datastore"
          );
        }

        return new EntityType(entityTypeType);
      });

  static getEntityTypes = (db: DBClient) => (args: { accountId: string }) =>
    db
      .getEntityTypes(args)
      .then((types) =>
        types.map((dbType) => new EntityType(dbType).toGQLEntityType())
      );

  toGQLEntityType = (): EntityTypeWithoutTypeFields => ({
    id: this.entityId,
    entityId: this.entityId,
    entityVersionId: this.entityVersionId,
    createdById: this.createdById,
    accountId: this.accountId,
    properties: this.properties,
    metadataId: this.entityId,
    createdAt: this.entityCreatedAt,
    entityVersionCreatedAt: this.entityVersionCreatedAt,
    updatedAt: this.entityVersionUpdatedAt,
    visibility: Visibility.Public /** @todo: get from entity metadata */,
  });
}

export default __EntityType;
