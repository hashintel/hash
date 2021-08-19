import { DataSource } from "apollo-datasource";

import { SystemType } from "src/types/entityTypes";

/**
 * @todo should probably store this enum in a non-generated file somewhere
 *    to revisit in light of fuller auth spec
 */
import { Visibility } from "../graphql/apiTypes.gen";

export type Entity = {
  accountId: string;
  createdById: string;
  entityId: string;
  entityVersionId: string;
  entityType: EntityType;
  entityTypeId: string;
  entityTypeName: string;
  entityTypeVersionId: string;
  id: string; // alias for entityId
  properties: any;
  metadataId: string;
  metadata: EntityMeta;
  createdAt: Date;
  updatedAt: Date;
  visibility: Visibility;
};

export type EntityType = {
  metadataId: string /** @todo remove this */;
  accountId: string;
  createdById: string;
  entityId: string;
  entityVersionId: string;
  entityType?: EntityType | undefined | null;
  entityTypeId?: string | undefined | null;
  entityTypeName?: "EntityType";
  entityTypeVersionId?: string;
  id: string; // alias for entityId
  properties: any;
  metadata: {
    versioned: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  visibility: Visibility;
};

export type EntityMeta = {
  metadataId: string;
  versioned: boolean;
  extra: any;
};

export type LoginCode = {
  id: string;
  code: string;
  userId: string;
  numberOfAttempts: number;
  createdAt: Date;
};

export type EntityVersion = {
  entityVersionId: string;
  createdAt: Date;
  createdById: string;
};

export interface DBAdapter extends DataSource, DBClient {
  /** Initiate a new database transaction. All `DBAdapter` methods called within
   * the provided callback `fn` are executed within the same transaction.
   * */
  transaction<T>(fn: (client: DBClient) => Promise<T>): Promise<T>;
}

/**
 * Generic interface to the database.
 */
export interface DBClient {
  /**
   * Create an entity type.
   * @param params.name the type name - must be unique in the specified account
   * @param params.schema JSON schema fields (e.g. 'properties', 'definition')
   */
  createEntityType(params: {
    accountId: string;
    createdById: string;
    name: string;
    schema?: Record<string, any>;
  }): Promise<EntityType>;

  /**
   * Create a new entity. If "entityVersionId" is not provided it will be automatically generated. To
   * create a versioned entity, set the optional parameter "versioned" to `true`.
   * */
  createEntity(params: {
    accountId: string;
    createdById: string;
    entityVersionId?: string | null | undefined;
    entityTypeId?: string | null | undefined;
    entityTypeVersionId?: string | null | undefined;
    systemTypeName?: SystemType | null | undefined;
    versioned: boolean;
    properties: any;
  }): Promise<Entity>;

  /** Get an entity by ID in a given account. If `lock` is set to `true`, then no
   * other client may access the entity until the current transaction has ended.
   */
  getEntity(
    params: {
      accountId: string;
      entityVersionId: string;
    },
    lock?: boolean
  ): Promise<Entity | undefined>;

  /**
   * Get the latest version of an entity.
   * @todo: this function can be combined with getEntity after the metadata_id &
   *   history_id merge.
   * */
  getEntityLatestVersion(params: {
    accountId: string;
    metadataId: string;
  }): Promise<Entity | undefined>;

  /**
   * Update an entity type.
   * @param params.name the type name - must be unique in the specified account
   * @param params.schema JSON schema fields (e.g. 'properties', 'definition')
   * */
  updateEntityType(params: {
    accountId: string;
    createdById: string;
    entityTypeId: string;
    name?: string;
    schema?: Record<string, any>;
  }): Promise<EntityType>;

  /**
   * Update an entity's properties.
   */
  updateEntity(params: {
    accountId: string;
    entityVersionId: string;
    metadataId: string;
    properties: any;
  }): Promise<Entity[]>;

  /** Get the user by their id. */
  getUserById(params: { id: string }): Promise<Entity | null>;

  /** Get the user by their email address. */
  getUserByEmail(params: { email: string }): Promise<Entity | null>;

  /** Get the user by their shortname. */
  getUserByShortname(params: { shortname: string }): Promise<Entity | null>;

  /**
   * Get all entities of a given type
   * @param params.accountId optionally limit results to entities in a specified account
   * @param params.entityTypeId the fixed entityTypeId
   * @param params.entityTypeVersionId optionally limit results to entities of a specific version of the type
   * @param params.latestOnly optionally limit results to the latest version of each entity

   * */
  getEntitiesByType(params: {
    accountId?: string;
    entityTypeId: string;
    entityTypeVersionId?: string;
    latestOnly: boolean;
  }): Promise<Entity[]>;

  /**
   * Get all entities of a given system type, in an account.
   * @param params.accountId optionally limit results to entities in a specified account
   * @param params.latestOnly optionally limit results to the latest version of each entity
   * @param params.systemTypeName the name of the system type
   * */
  getEntitiesBySystemType(params: {
    accountId?: string;
    latestOnly: boolean;
    systemTypeName: SystemType;
  }): Promise<Entity[]>;

  /**
   * Get all account type entities (User or Account).
   */
  getAccountEntities(): Promise<Entity[]>;

  /** Update the metadata which may be associated with one or more entities. */
  updateEntityMetadata(params: {
    accountId: string;
    metadataId: string;
    extra: any;
  }): Promise<EntityMeta>;

  /** Create a login code */
  createLoginCode(params: {
    accountId: string;
    userId: string;
    code: string;
  }): Promise<LoginCode>;

  /** Get a login code (it may be invalid!) */
  getLoginCode(params: { loginId: string }): Promise<LoginCode | null>;

  /** Increment the number of login attempts by 1 */
  incrementLoginCodeAttempts(params: { loginCode: LoginCode }): Promise<void>;

  /** Prunes login codes from the database after 1 day of creation */
  pruneLoginCodes(): Promise<number>;

  /**
   * getAndUpdateEntity may be used to retrieve and update an entity within
   * the same transaction. It accepts a handler function which, given the
   * current state of the entity, should return an updated state. Returns
   * the state of all updated entities.
   * */
  getAndUpdateEntity(params: {
    accountId: string;
    entityVersionId: string;
    handler: (entity: Entity) => Entity;
  }): Promise<Entity[]>;

  /**
   * getEntityHistory returns the sorted version timeline of an entity given its
   * `metadataId`.
   * */
  getEntityHistory(params: {
    accountId: string;
    metadataId: string;
  }): Promise<EntityVersion[]>;

  /** Get multiple entities by their account ID and entity ID. */
  getEntities(
    entities: {
      accountId: string;
      entityVersionId: string;
    }[]
  ): Promise<Entity[]>;
}
