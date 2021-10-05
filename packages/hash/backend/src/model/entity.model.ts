import { JSONObject } from "@hashintel/block-protocol";
import merge from "lodash.merge";
import { Entity, EntityType, EntityWithIncompleteEntityType } from ".";
import { DBClient } from "../db";
import {
  DBLinkedEntity,
  EntityMeta,
  EntityType as DbEntityType,
} from "../db/adapter";
import { Visibility } from "../graphql/apiTypes.gen";
import { SystemType } from "../types/entityTypes";

export type EntityConstructorArgs = {
  entityId: string;
  entityVersionId: string;
  createdById: string;
  accountId: string;
  entityType: DbEntityType | EntityType;
  properties: JSONObject;
  visibility: Visibility;
  metadata: EntityMeta;
  entityCreatedAt: Date;
  entityVersionCreatedAt: Date;
  entityVersionUpdatedAt: Date;
};

type CreateEntityArgsWithoutType = {
  accountId: string;
  createdById: string;
  versioned: boolean;
  properties: any;
};

export type CreateEntityWithEntityTypeIdArgs = {
  entityTypeId: string;
} & CreateEntityArgsWithoutType;

export type CreateEntityWithEntityTypeVersionIdArgs = {
  entityTypeVersionId: string;
} & CreateEntityArgsWithoutType;

export type CreateEntityWithSystemTypeArgs = {
  systemTypeName: SystemType;
} & CreateEntityArgsWithoutType;

export type CreateEntityArgs =
  | CreateEntityWithEntityTypeIdArgs
  | CreateEntityWithEntityTypeVersionIdArgs
  | CreateEntityWithSystemTypeArgs;

class __Entity {
  entityId: string;

  entityVersionId: string;

  createdById: string;

  accountId: string;

  entityType: EntityType;

  properties: JSONObject;

  visibility: Visibility;

  metadata: EntityMeta;

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
    visibility,
    metadata,
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
    this.visibility = visibility;
    this.metadata = metadata;
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

  static getEntities =
    (client: DBClient) =>
    async (
      entities: {
        accountId: string;
        entityId: string;
        entityVersionId?: string;
      }[]
    ): Promise<Entity[]> => {
      const dbEntities = await client.getEntities(entities);

      return dbEntities.map((dbEntity) => new Entity(dbEntity));
    };

  static updateProperties =
    (client: DBClient) =>
    (args: { accountId: string; entityId: string; properties: string }) =>
      client
        .updateEntity(args)
        .then((updatedDbEntity) => new Entity(updatedDbEntity));

  convertToDBLink = (): DBLinkedEntity => ({
    __linkedData: {
      entityId: this.entityId,
      entityTypeId: this.entityType.entityId,
    },
  });

  updateProperties = (client: DBClient) => (properties: any) =>
    client
      .updateEntity({
        accountId: this.accountId,
        entityId: this.entityId,
        properties,
      })
      .then((updatedDbEntity) => {
        merge(this, new Entity(updatedDbEntity));

        return this;
      });

  static acquireLock = (client: DBClient) => (args: { entityId: string }) =>
    client.acquireEntityLock(args);

  acquireLock = (client: DBClient) =>
    Entity.acquireLock(client)({ entityId: this.entityId });

  /**
   * Refetches the entity's latest version, updating the entity's properties
   * and related values to the latest version found in the datastore.
   *
   * This may update the `entityVersionId` if the entity is versioned.
   */
  refetchLatestVersion = async (client: DBClient) => {
    const refetchedDbEntity = await client.getEntityLatestVersion({
      accountId: this.accountId,
      entityId: this.entityId,
    });

    if (!refetchedDbEntity) {
      throw new Error(
        `Could not find latest version of entity with entityId ${this.entityId} in the datastore`
      );
    }

    merge(this, new Entity(refetchedDbEntity));

    return this;
  };

  toGQLEntity = (): Omit<EntityWithIncompleteEntityType, "properties"> => ({
    id: this.entityVersionId,
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
    visibility: this.visibility,
  });

  toGQLUnknownEntity = (): EntityWithIncompleteEntityType => ({
    ...this.toGQLEntity(),
    properties: this.properties,
  });
}

export default __Entity;
