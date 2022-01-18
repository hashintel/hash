import { JSONObject } from "blockprotocol";
import { ApolloError } from "apollo-server-errors";
import { PathComponent } from "jsonpath";
import { merge } from "lodash";
import {
  Account,
  Entity,
  EntityType,
  UnresolvedGQLEntityType,
  Link,
  CreateLinkArgs,
  Aggregation,
  CreateAggregationArgs,
} from ".";
import { DBClient } from "../db";
import { EntityMeta, EntityType as DbEntityType } from "../db/adapter";
import {
  Visibility,
  Entity as GQLEntity,
  UnknownEntity as GQLUnknownEntity,
  EntityVersion,
} from "../graphql/apiTypes.gen";
import { SystemType } from "../types/entityTypes";

export type EntityExternalResolvers =
  | "entityType" // resolved in resolvers/entityTypeTypeFields
  | "linkGroups" // resolved in resolvers/linkGroups
  | "linkedEntities" // resolved in resolvers/linkedEntities
  | "linkedAggregations" // resovled in resolvers/linkedAggregations
  | "__typename";

export type UnresolvedGQLEntity = Omit<GQLEntity, EntityExternalResolvers> & {
  entityType: UnresolvedGQLEntityType;
};

export type UnresolvedGQLUnknownEntity = Omit<
  GQLUnknownEntity,
  EntityExternalResolvers
> & { entityType: UnresolvedGQLEntityType };

export type EntityConstructorArgs = {
  entityId: string;
  entityVersionId: string;
  accountId: string;
  entityType: DbEntityType | EntityType;
  properties: JSONObject;
  visibility: Visibility;
  metadata: EntityMeta;
  createdByAccountId: string;
  createdAt: Date;
  updatedByAccountId: string;
  updatedAt: Date;
};

type CreateEntityArgsWithoutType = {
  accountId: string;
  createdByAccountId: string;
  versioned: boolean;
  properties: any;
  entityVersionId?: string;
  entityId?: string;
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

export type UpdatePropertiesPayload<T = JSONObject> = {
  properties: T;
  updatedByAccountId: string;
};

export type PartialPropertiesUpdatePayload<T = JSONObject> = {
  properties: Partial<T>;
  updatedByAccountId: string;
};

export type UpdateEntityPropertiesParams<T = JSONObject> = {
  accountId: string;
  entityId: string;
  properties: T;
  updatedByAccountId: string;
};

class __Entity {
  entityId: string;
  entityVersionId: string;
  accountId: string;
  entityType: EntityType;
  properties: JSONObject;
  visibility: Visibility;
  metadata: EntityMeta;
  createdByAccountId: string;
  createdAt: Date;
  updatedByAccountId: string;
  updatedAt: Date;

  constructor({
    entityId,
    entityVersionId,
    accountId,
    entityType,
    properties,
    visibility,
    metadata,
    createdByAccountId,
    createdAt,
    updatedByAccountId,
    updatedAt,
  }: EntityConstructorArgs) {
    this.entityId = entityId;
    this.entityVersionId = entityVersionId;
    this.createdByAccountId = createdByAccountId;
    this.accountId = accountId;
    this.entityType =
      entityType instanceof EntityType
        ? entityType
        : new EntityType(entityType);
    this.properties = properties;
    this.visibility = visibility;
    this.metadata = metadata;
    this.createdAt = createdAt;
    this.createdByAccountId = createdByAccountId;
    this.updatedAt = updatedAt;
    this.updatedByAccountId = updatedByAccountId;
  }

  static async create(
    client: DBClient,
    params: CreateEntityArgs,
  ): Promise<Entity> {
    const dbEntity = await client.createEntity(params);

    return new Entity(dbEntity);
  }

  static async getEntity(
    client: DBClient,
    params: {
      accountId: string;
      entityVersionId: string;
    },
  ): Promise<Entity | null> {
    const dbEntity = await client.getEntity(params);

    return dbEntity ? new Entity(dbEntity) : null;
  }

  /** Gets all versions of a single entity */
  static async getEntityHistory(
    client: DBClient,
    {
      accountId,
      entityId,
      order,
    }: {
      accountId: string;
      entityId: string;
      order: "asc" | "desc";
    },
  ): Promise<EntityVersion[]> {
    const entities = await client.getEntityHistory({
      accountId,
      entityId,
      order,
    });
    return entities.map((entity) => ({
      ...entity,
      createdAt: entity.updatedAt.toISOString(),
    }));
  }

  static async getEntityLatestVersion(
    client: DBClient,
    params: {
      accountId: string;
      entityId: string;
    },
  ): Promise<Entity | null> {
    const dbEntity = await client.getEntityLatestVersion(params);

    return dbEntity ? new Entity(dbEntity) : null;
  }

  static async getEntitiesByType(
    client: DBClient,
    params: {
      accountId: string;
      entityTypeId: string;
      entityTypeVersionId?: string;
      latestOnly: boolean;
    },
  ): Promise<Entity[]> {
    const dbEntities = await client.getEntitiesByType(params);

    return dbEntities.map((dbEntity) => new Entity(dbEntity));
  }

  static async getEntitiesBySystemType(
    client: DBClient,
    params: {
      accountId: string;
      latestOnly: boolean;
      systemTypeName: SystemType;
    },
  ): Promise<Entity[]> {
    const dbEntities = await client.getEntitiesBySystemType(params);

    return dbEntities.map((dbEntity) => new Entity(dbEntity));
  }

  static async getEntities(
    client: DBClient,
    entities: {
      accountId: string;
      entityId: string;
      entityVersionId?: string;
    }[],
  ): Promise<Entity[]> {
    const dbEntities = await client.getEntities(entities);

    return dbEntities.map((dbEntity) => new Entity(dbEntity));
  }

  static async getAccountEntities(
    client: DBClient,
    params: {
      accountId: string;
      entityTypeFilter?: {
        componentId?: string;
        entityTypeId?: string;
        entityTypeVersionId?: string;
        systemTypeName?: SystemType;
      };
    },
  ): Promise<Entity[]> {
    const dbEntities = await client.getAccountEntities(params);

    return dbEntities.map((dbEntity) => new Entity(dbEntity));
  }

  static async updateProperties(
    client: DBClient,
    params: UpdateEntityPropertiesParams,
  ) {
    const updatedDbEntity = await client.updateEntity(params);

    return new Entity(updatedDbEntity);
  }

  protected async partialPropertiesUpdate(
    client: DBClient,
    params: PartialPropertiesUpdatePayload,
  ) {
    return this.updateProperties(client, {
      updatedByAccountId: params.updatedByAccountId,
      properties: {
        ...this.properties,
        ...params.properties,
      } as JSONObject,
    });
  }

  protected async updateProperties(
    client: DBClient,
    params: UpdatePropertiesPayload,
  ) {
    const updatedDbEntity = await client.updateEntity({
      accountId: this.accountId,
      entityId: this.entityId,
      properties: params.properties,
      updatedByAccountId: params.updatedByAccountId,
    });
    merge(this, new Entity(updatedDbEntity));

    return this.properties;
  }

  updateEntityProperties(client: DBClient, params: UpdatePropertiesPayload) {
    return this.updateProperties(client, params);
  }

  async transferEntity(client: DBClient, newAccountId: string) {
    if (Account.isEntityAnAccount(this)) {
      throw new Error(
        `Trying to transfer entity ${this.entityId} which is an account. Accounts can't be transferred.`,
      );
    }
    const exists = await Account.accountExists(client, newAccountId);
    if (!exists) {
      throw new Error(
        `Trying to transfer entity to new account ${newAccountId} which doesn't exist.`,
      );
    }
    await client.updateEntityAccountId({
      originalAccountId: this.accountId,
      entityId: this.entityId,
      newAccountId,
    });
    this.accountId = newAccountId;
  }

  static acquireLock(client: DBClient, params: { entityId: string }) {
    return client.acquireEntityLock(params);
  }

  acquireLock(client: DBClient) {
    return Entity.acquireLock(client, { entityId: this.entityId });
  }

  /**
   * Refetches the entity's latest version, updating the entity's properties
   * and related values to the latest version found in the datastore.
   *
   * This may update the `entityVersionId` if the entity is versioned.
   */
  async refetchLatestVersion(client: DBClient) {
    const refetchedDbEntity = await client.getEntityLatestVersion({
      accountId: this.accountId,
      entityId: this.entityId,
    });

    if (!refetchedDbEntity) {
      throw new Error(
        `Could not find latest version of entity with entityId ${this.entityId} in the datastore`,
      );
    }

    merge(this, new Entity(refetchedDbEntity));

    return this;
  }

  isEquivalentTo(otherEntity: Entity): boolean {
    return (
      this.accountId === otherEntity.accountId &&
      this.entityId === otherEntity.entityId &&
      this.entityVersionId === otherEntity.entityVersionId
    );
  }

  async getHistory(client: DBClient, params?: { order: "desc" | "asc" }) {
    const history = await Entity.getEntityHistory(client, {
      accountId: this.accountId,
      entityId: this.entityId,
      order: params?.order ?? "desc",
    });

    return history;
  }

  async createAggregation(
    client: DBClient,
    params: Omit<CreateAggregationArgs, "source">,
  ): Promise<Aggregation> {
    const aggregation = await Aggregation.create(client, {
      ...params,
      source: this,
    });

    return aggregation;
  }

  async getAggregations(client: DBClient) {
    const aggregations = await Aggregation.getAllEntityAggregations(client, {
      source: this,
    });

    return aggregations;
  }

  async getAggregation(
    client: DBClient,
    params: {
      stringifiedPath: string;
    },
  ) {
    const { stringifiedPath } = params;
    const aggregation = await Aggregation.getEntityAggregation(client, {
      source: this,
      stringifiedPath,
    });

    return aggregation;
  }

  async getOutgoingLinks(
    client: DBClient,
    params?: {
      stringifiedPath?: string;
      path?: PathComponent[];
    },
  ) {
    const outgoingDBLinks = await client.getEntityOutgoingLinks({
      accountId: this.accountId,
      entityId: this.entityId,
      entityVersionId: this.metadata.versioned
        ? this.entityVersionId
        : undefined,
      path:
        params?.stringifiedPath ??
        (params?.path ? Link.stringifyPath(params.path) : undefined),
    });
    return outgoingDBLinks.map((dbLink) => new Link(dbLink));
  }

  async getOutgoingLink(
    client: DBClient,
    params: {
      linkId: string;
    },
  ) {
    const link = await Link.get(client, {
      ...params,
      sourceAccountId: this.accountId,
    });

    return link;
  }

  async createOutgoingLink(
    client: DBClient,
    params: Omit<CreateLinkArgs, "source">,
  ) {
    /** @todo: check entity type whether this link can be created */

    const link = await Link.create(client, {
      ...params,
      source: this,
    });

    // If this is a versioned entity, fetch the updated entityVersionId
    if (this.metadata.versioned) {
      await this.refetchLatestVersion(client);
    }

    return link;
  }

  async deleteOutgoingLink(
    client: DBClient,
    params: { linkId: string; deletedByAccountId: string },
  ): Promise<void> {
    const link = await this.getOutgoingLink(client, params);

    if (!link) {
      throw new ApolloError(
        `Link with sourceAccountId ${this.accountId}, sourceEntityId ${this.entityId} and linkId ${params.linkId} not found`,
        "NOT_FOUND",
      );
    }

    /** @todo: check entity type whether this link can be deleted */

    await link.delete(client, {
      deletedByAccountId: params.deletedByAccountId,
    });

    if (this.metadata.versioned) {
      await this.refetchLatestVersion(client);
    }
  }

  toGQLEntity(): Omit<UnresolvedGQLEntity, "properties"> {
    return {
      id: this.entityVersionId,
      entityId: this.entityId,
      entityVersionId: this.entityVersionId,
      createdByAccountId: this.createdByAccountId,
      accountId: this.accountId,
      entityTypeId: this.entityType.entityId,
      entityTypeVersionId: this.entityType.entityVersionId,
      /** @todo: stop casting this */
      entityTypeName: this.entityType.properties.title as string,
      entityType: this.entityType.toGQLEntityType(),
      metadataId: this.entityId,
      createdAt: this.createdAt.toISOString(),
      /** TODO: We should update the gql definition of entities to match the new created_at/updated_at system
       * For now keeping it as it is to avoid changing too many things at once
       */
      entityVersionCreatedAt: this.updatedAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      visibility: this.visibility,
    };
  }

  toGQLUnknownEntity(): UnresolvedGQLUnknownEntity {
    return {
      ...this.toGQLEntity(),
      properties: this.properties,
    };
  }
}

export default __Entity;
