import { DataSource } from "apollo-datasource";

import { SystemType } from "../types/entityTypes";

/**
 * @todo should probably store this enum in a non-generated file somewhere
 *    to revisit in light of fuller auth spec
 */
import { Visibility } from "../graphql/apiTypes.gen";
import { DBVerificationCode } from "../types/dbTypes";

export type Entity = {
  accountId: string;
  createdById: string;
  entityId: string;
  entityVersionId: string;
  entityType: EntityType;
  entityTypeId: string;
  entityTypeName: string;
  entityTypeVersionId: string;
  id: string /** @todo remove this once no longer relied on by FE */;
  metadataId: string /** @todo remove this once no longer relied on by FE */;
  properties: any;
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
  entityType?:
    | EntityType
    | undefined
    | null /** @todo make these non-optional once EntityType type exists */;
  entityTypeId?: string | undefined | null;
  entityTypeName?: "EntityType";
  entityTypeVersionId?: string;
  id: string /** @todo remove this in follow-up PR */;
  properties: any;
  metadata: {
    versioned: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
  visibility: Visibility;
};

export type EntityMeta = {
  versioned: boolean;
  extra: any;
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
    entityId: string;
  }): Promise<Entity | undefined>;

  /**
   * Get the latest version of a system entity type.
   * */
  getSystemTypeLatestVersion(params: {
    systemTypeName: SystemType;
  }): Promise<EntityType | undefined>;

  /**
   * Update an entity type.
   * @param params.name the type name - must be unique in the specified account
   * @param params.schema JSON schema fields (e.g. 'properties', 'definition')
   * */
  updateEntityType(params: {
    accountId: string;
    createdById: string;
    entityTypeId: string;
    newName?: string;
    newSchema?: Record<string, any>;
  }): Promise<EntityType>;

  /**
   * Update an entity's properties.
   */
  updateEntity(params: {
    accountId: string;
    entityVersionId: string;
    entityId: string;
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
   * @param params.accountId the account to retrieve entities from
   * @param params.entityTypeId the fixed entityTypeId
   * @param params.entityTypeVersionId optionally limit results to entities of a specific version of the type
   * @param params.latestOnly optionally limit results to the latest version of each entity

   * */
  getEntitiesByType(params: {
    accountId: string;
    entityTypeId: string;
    entityTypeVersionId?: string;
    latestOnly: boolean;
  }): Promise<Entity[]>;

  /**
   * Get all entities of a given system type, in an account.
   * @todo handle this instead by sending a cached result from systemTypeId into getEntitiesByType
   * @param params.accountId the account to retrieve entities from
   * @param params.latestOnly optionally limit results to the latest version of each entity
   * @param params.systemTypeName the name of the system type
   * */
  getEntitiesBySystemType(params: {
    accountId: string;
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
    entityId: string;
    extra: any;
  }): Promise<EntityMeta>;

  /** Create a verification code */
  createVerificationCode(params: {
    accountId: string;
    userId: string;
    code: string;
    emailAddress: string;
  }): Promise<DBVerificationCode>;

  /** Get a verification code (it may be invalid!) */
  getVerificationCode(params: {
    id: string;
  }): Promise<DBVerificationCode | null>;

  /** Increment the number of verification attempts by 1 */
  incrementVerificationCodeAttempts(params: {
    id: string;
    userId: string;
  }): Promise<void>;

  /** Prunes verification codes from the database after 1 day of creation */
  pruneVerificationCodes(): Promise<number>;

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
   * `entityId`.
   * */
  getEntityHistory(params: {
    accountId: string;
    entityId: string;
  }): Promise<EntityVersion[]>;

  /** Get multiple entities by their account ID and entity ID. */
  getEntities(
    entities: {
      accountId: string;
      entityVersionId: string;
    }[]
  ): Promise<Entity[]>;
}
