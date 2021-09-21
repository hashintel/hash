import { DataSource } from "apollo-datasource";

import { SystemType } from "../types/entityTypes";

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
  properties: any;
  metadata: EntityMeta;

  /** The time at which the first version of this entity was created. */
  entityCreatedAt: Date;

  /** The time at which this version of the entity was created. */
  entityVersionCreatedAt: Date;

  /** The time at which this entity version was updated. For versioned entities, this
   * always matches `entityVersionCreatedAt`.*/
  entityVersionUpdatedAt: Date;

  visibility: Visibility;
};

export type EntityType = Omit<Entity, EntityTypeTypeFields> & {
  /**
   *  @todo make these non-optional if we figure a way of getting the EntityType entityType
   *    attached without recursion headaches. see https://github.com/hashintel/dev/pull/200
   */
  entityType?: EntityType | undefined | null;
  entityTypeId?: string | undefined | null;
  entityTypeName?: "EntityType";
  entityTypeVersionId?: string;
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

export type VerificationCode = {
  id: string;
  code: string;
  emailAddress: string;
  accountId: string;
  userId: string;
  numberOfAttempts: number;
  used: boolean;
  createdAt: Date;
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
    description?: string | null;
    name: string;
    schema?: Record<string, any> | null;
  }): Promise<EntityType>;

  /**
   * Create a new entity. If "entityVersionId" is not provided it will be automatically
   * generated. To create a versioned entity, set the optional parameter "versioned" to
   * `true`. One of entityTypeId, entityTypeVersionId or systemTypeName must be provided.
   * */
  createEntity(params: {
    accountId: string;
    createdById: string;
    entityId?: string | null | undefined;
    entityVersionId?: string | null | undefined;
    entityTypeId?: string;
    entityTypeVersionId?: string | null | undefined;
    systemTypeName?: SystemType | null | undefined;
    versioned: boolean;
    properties: any;
  }): Promise<Entity>;

  /**
   * Get an entity's accountId using its entityVersionId
   */
  getEntityAccountId(params: { entityVersionId: string }): Promise<string>;

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
   * Get an entityType by its fixed id.
   * @todo should this also handle requests for a specific version?
   *    Should be consistent with how getEntity/getEntityLatestVersion are merged.
   */
  getEntityTypeLatestVersion(params: {
    entityTypeId: string;
  }): Promise<EntityType | null>;

  /**
   * Get the latest version of a system entity type.
   * */
  getSystemTypeLatestVersion(params: {
    systemTypeName: SystemType;
  }): Promise<EntityType | undefined>;

  /**
   * Update an entity type.
   * @param params.newName the type name - must be unique in the specified account
   * @param params.newSchema JSON schema fields (e.g. 'properties', 'definition')
   * */
  updateEntityType(params: {
    accountId: string; // @todo: can we remove this?
    createdById: string;
    entityId: string;
    entityVersionId?: string;
    newName?: string;
    newSchema?: Record<string, any>;
  }): Promise<EntityType>;

  /**
   * Update an entity's properties.
   */
  updateEntity(params: {
    accountId: string;
    entityId: string;
    properties: any;
  }): Promise<Entity[]>;

  /**
   * Get the user by their email address.
   * @param params.email the email address
   * @param params.verified whether the email address is verified or not (when undefined the email can be either)
   * @param params.primary whether the email address is the primary email or not (when undefined the email can be either)
   * */
  getUserByEmail(params: {
    email: string;
    verified?: boolean;
    primary?: boolean;
  }): Promise<Entity | null>;

  /** Get the user by their shortname. */
  getUserByShortname(params: { shortname: string }): Promise<Entity | null>;

  /** Get the org by its shortname. */
  getOrgByShortname(params: { shortname: string }): Promise<Entity | null>;

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
  getAllAccounts(): Promise<Entity[]>;

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
  }): Promise<VerificationCode>;

  /** Get a verification code (it may be invalid!) */
  getVerificationCode(params: { id: string }): Promise<VerificationCode | null>;

  /** Increment the number of verification attempts by 1 */
  incrementVerificationCodeAttempts(params: {
    id: string;
    userId: string;
  }): Promise<void>;

  /** Sets the verification code to used */
  setVerificationCodeToUsed(params: {
    id: string;
    userId: string;
  }): Promise<void>;

  /**
   * Prunes verification codes from the datastore older than the maximum age
   * @param params.maxAgeInMs: the maximum age of a verification code in milliseconds
   */
  pruneVerificationCodes(params: { maxAgeInMs: number }): Promise<number>;

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

  /** Get entity types associated with a given accountId */
  getEntityTypes(params: { accountId: string }): Promise<EntityType[]>;
}
