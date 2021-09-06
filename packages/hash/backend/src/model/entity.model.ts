import { DBClient } from "../db";
import { EntityType as DbEntityType } from "../db/adapter";
import EntityType from "./entityType.model";
import { Visibility } from "../graphql/apiTypes.gen";
import { EntityWithIncompleteEntityType } from "./entityType.model";
import { SystemType } from "../types/entityTypes";

export type EntityConstructorArgs = {
  entityId: string;
  entityVersionId: string;
  createdById: string;
  accountId: string;
  entityType: DbEntityType | EntityType;
  properties: any;
  // metadata: EntityMeta;
  entityCreatedAt: Date;
  entityVersionCreatedAt: Date;
  entityVersionUpdatedAt: Date;
};

export type CreateEntityArgs = {
  accountId: string;
  createdById: string;
  entityVersionId?: string | null | undefined;
  entityTypeId?: string;
  entityTypeVersionId?: string | null | undefined;
  systemTypeName?: SystemType | null | undefined;
  versioned: boolean;
  properties: any;
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
    this.entityType = entityType instanceof EntityType ? entityType : new EntityType(entityType);
    this.properties = properties;
    this.entityCreatedAt = entityCreatedAt;
    this.entityVersionCreatedAt = entityVersionCreatedAt;
    this.entityVersionUpdatedAt = entityVersionUpdatedAt;
  }

  static create =
    (client: DBClient) =>
    async (args: CreateEntityArgs): Promise<Entity> =>
      client.createEntity(args).then((dbEntity) => new Entity(dbEntity));

  static getEntityById =
    (client: DBClient) =>
    ({
      accountId,
      entityVersionId,
    }: {
      accountId: string;
      entityVersionId: string;
    }): Promise<Entity | null> =>
      client
        .getEntity({
          accountId,
          entityVersionId,
        })
        .then((dbEntity) => (dbEntity ? new Entity(dbEntity) : null));

  /**
   * Must occur in the same db transaction as when `this.properties` was fetched
   * to prevent overriding externally-updated properties
   */
  updateProperties = (client: DBClient) => (properties: any) =>
    client
      .updateEntity({
        accountId: this.accountId,
        entityVersionId: this.entityVersionId,
        entityId: this.entityId,
        properties,
      })
      .then(() => {
        this.properties = properties;
        return this;
      });

  toGQLEntity = (): Omit<EntityWithIncompleteEntityType, "properties"> => ({
    id: this.entityId,
    entityId: this.entityId,
    entityVersionId: this.entityVersionId,
    createdById: this.createdById,
    accountId: this.accountId,
    entityTypeId: this.entityType.entityId,
    entityTypeVersionId: this.entityType.entityVersionId,
    /** @todo: stop casting this */
    entityTypeName: this.entityType.properties.title as string,
    entityType: this.entityType.toGQLEntityType(),
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
