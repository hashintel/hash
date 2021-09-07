import { Entity, EntityType, EntityWithIncompleteEntityType } from ".";
import { DBClient } from "../db";
import { EntityType as DbEntityType } from "../db/adapter";
import { Visibility } from "../graphql/apiTypes.gen";
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
  entityId?: string | null | undefined;
  entityVersionId?: string | null | undefined;
  entityTypeId?: string;
  entityTypeVersionId?: string | null | undefined;
  systemTypeName?: SystemType | null | undefined;
  versioned: boolean;
  properties: any;
};

class __Entity {
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
    this.entityType =
      entityType instanceof EntityType
        ? entityType
        : new EntityType(entityType);
    this.properties = properties;
    this.entityCreatedAt = entityCreatedAt;
    this.entityVersionCreatedAt = entityVersionCreatedAt;
    this.entityVersionUpdatedAt = entityVersionUpdatedAt;
  }

  static create =
    (client: DBClient) =>
    async (args: CreateEntityArgs): Promise<Entity> =>
      client.createEntity(args).then((dbEntity) => new Entity(dbEntity));

  static getEntity =
    (client: DBClient) =>
    async (args: {
      accountId: string;
      entityVersionId: string;
    }): Promise<Entity | null> => {
      const dbEntity = await client.getEntity(args);

      return dbEntity ? new Entity(dbEntity) : null;
    };

  static getEntityLatestVersion =
    (client: DBClient) =>
    async (args: {
      accountId: string;
      entityId: string;
    }): Promise<Entity | null> => {
      const dbEntity = await client.getEntityLatestVersion(args);

      return dbEntity ? new Entity(dbEntity) : null;
    };

  static getEntitiesByType =
    (client: DBClient) =>
    async (args: {
      accountId: string;
      entityTypeId: string;
      entityTypeVersionId?: string;
      latestOnly: boolean;
    }): Promise<Entity[]> =>
      client
        .getEntitiesByType(args)
        .then((dbEntities) =>
          dbEntities.map((dbEntity) => new Entity(dbEntity))
        );

  static getEntitiesBySystemType =
    (client: DBClient) =>
    async (args: {
      accountId: string;
      latestOnly: boolean;
      systemTypeName: SystemType;
    }): Promise<Entity[]> =>
      client
        .getEntitiesBySystemType(args)
        .then((dbEntities) =>
          dbEntities.map((dbEntity) => new Entity(dbEntity))
        );

  static getAccountEntities = async (client: DBClient): Promise<Entity[]> => {
    const dbEntities = await client.getAccountEntities();

    return dbEntities.map((dbEntity) => new Entity(dbEntity));
  };

  static getEntities =
    (client: DBClient) =>
    async (
      entities: {
        accountId: string;
        entityVersionId: string;
      }[]
    ): Promise<Entity[]> => {
      const dbEntities = await client.getEntities(entities);

      return dbEntities.map((dbEntity) => new Entity(dbEntity));
    };

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

export default __Entity;
