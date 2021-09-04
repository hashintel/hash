import { dbEntityTypeToGraphQLEntityType } from "../graphql/util";
import { DBClient } from "../db";
import { EntityType } from "../db/adapter";
import { Visibility } from "../graphql/apiTypes.gen";
import { EntityWithIncompleteEntityType } from "./entityType.model";

export type EntityConstructorArgs = {
  entityId: string;
  entityVersionId: string;
  createdById: string;
  accountId: string;
  entityType: EntityType;
  properties: any;
  // metadata: EntityMeta;
  entityCreatedAt: Date;
  entityVersionCreatedAt: Date;
  entityVersionUpdatedAt: Date;
};

class Entity {
  entityId: string;
  entityVersionId: string;
  createdById: string;
  accountId: string;
  entityType: EntityType;
  properties: any;
  // metadata: EntityMeta;
  entityCreatedAt: Date;
  entityVersionCreatedAt: Date;
  entityVersionUpdatedAt: Date;

  constructor({
    entityId,
    entityVersionId,
    createdById,
    accountId,
    entityType,
    properties,
    // metadata,
    entityCreatedAt,
    entityVersionCreatedAt,
    entityVersionUpdatedAt,
  }: EntityConstructorArgs) {
    this.entityId = entityId;
    this.entityVersionId = entityVersionId;
    this.createdById = createdById;
    this.accountId = accountId;
    this.entityType = entityType;
    this.properties = properties;
    this.entityCreatedAt = entityCreatedAt;
    this.entityVersionCreatedAt = entityVersionCreatedAt;
    this.entityVersionUpdatedAt = entityVersionUpdatedAt;
  }

  static getEntityById =
    (db: DBClient) =>
    ({
      accountId,
      entityVersionId,
    }: {
      accountId: string;
      entityVersionId: string;
    }): Promise<Entity | null> =>
      db
        .getEntity({
          accountId,
          entityVersionId,
        })
        .then((dbEntity) => (dbEntity ? new Entity(dbEntity) : null));

  toGQLEntity = (): Omit<EntityWithIncompleteEntityType, "properties"> => ({
    id: this.entityId,
    entityId: this.entityId,
    entityVersionId: this.entityVersionId,
    createdById: this.createdById,
    accountId: this.accountId,
    entityTypeId: this.entityType.entityId,
    entityTypeVersionId: this.entityType.entityVersionId,
    /** @todo: stop casting this */
    entityTypeName: this.entityType.entityTypeName as string,
    entityType: dbEntityTypeToGraphQLEntityType(this.entityType),
    metadataId: this.entityId,
    createdAt: this.entityCreatedAt,
    entityVersionCreatedAt: this.entityVersionCreatedAt,
    updatedAt: this.entityVersionUpdatedAt,
    visibility: Visibility.Public /** @todo: get from entity metadata */,
  });

  toGQLUnknownEntity = (): EntityWithIncompleteEntityType => ({
    ...this.toGQLEntity(),
    properties: this.properties,
  });
}

export default Entity;
