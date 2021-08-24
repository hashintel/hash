import { DBAdapter } from "../db";
import { EntityType } from "../db/adapter";
import {
  Entity as GQLEntity,
  EntityType as GQLEntityType,
  UnknownEntity as GQLUnknownEntity,
  Visibility,
} from "../graphql/apiTypes.gen";

export type EntityConstructorArgs = {
  entityId: string;
  entityVersionId: string;
  createdById: string;
  accountId: string;
  entityType: EntityType;
  properties: any;
  metadataId: string;
  // metadata: EntityMeta;
  createdAt: Date;
  updatedAt: Date;
};

class Entity {
  entityId: string;
  entityVersionId: string;
  createdById: string;
  accountId: string;
  entityType: EntityType;
  properties: any;
  metadataId: string;
  // metadata: EntityMeta;
  createdAt: Date;
  updatedAt: Date;

  constructor({
    entityId,
    entityVersionId,
    createdById,
    accountId,
    entityType,
    properties,
    metadataId,
    // metadata,
    createdAt,
    updatedAt,
  }: EntityConstructorArgs) {
    this.entityId = entityId;
    this.entityVersionId = entityVersionId;
    this.createdById = createdById;
    this.accountId = accountId;
    this.entityType = entityType;
    this.properties = properties;
    this.metadataId = metadataId;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static getEntityById =
    (db: DBAdapter) =>
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

  toGQLEntity = (): GQLEntity => ({
    id: this.entityId,
    entityId: this.entityId,
    entityVersionId: this.entityVersionId,
    createdById: this.createdById,
    accountId: this.accountId,
    entityTypeId: this.entityType.entityId,
    entityTypeVersionId: this.entityType.entityVersionId,
    /** @todo: stop casting this */
    entityTypeName: this.entityType.entityTypeName as string,
    /** @todo: stop casting this */
    entityType: this.entityType as GQLEntityType,
    metadataId: this.metadataId,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    visibility: Visibility.Public /** @todo: get from entity metadata */,
  });

  toGQLUnknownEntity = (): GQLUnknownEntity => ({
    ...this.toGQLEntity(),
    /** @todo: stop casting this */
    entityType: this.entityType as GQLEntityType,
    properties: this.properties,
  });
}

export default Entity;
