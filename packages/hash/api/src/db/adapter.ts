import { DataSource } from "apollo-datasource";
import { TextToken } from "@hashintel/hash-shared/graphql/types";

import { SystemType } from "../types/entityTypes";

/**
 * @todo should probably store this enum in a non-generated file somewhere
 *    to revisit in light of fuller auth spec
 */
import {
  StorageType,
  OrgSize,
  Visibility,
  WayToUseHash,
} from "../graphql/apiTypes.gen";

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

export type EntityMeta = {
  versioned: boolean;
  extra: any;
};

export type DbEntity = {
  accountId: string;
  entityId: string;
  entityVersionId: string;
  entityType: EntityType;
  entityTypeId: string;
  entityTypeName: string;
  entityTypeVersionId: string;
  properties: any;
  metadata: EntityMeta;

  /** The time at which the first version of this entity was created. */
  createdAt: Date;
  /** The id of the account that created the first version of this entity */
  createdByAccountId: string;

  /** The time at which this entity version was updated. */
  updatedAt: Date;
  /** The id of the account that last updated this version */
  updatedByAccountId: string;

  visibility: Visibility;
};

export type EntityWithOutgoingEntityIds = DbEntity & {
  outgoingEntityIds?: string[];
};

export type DbLink = {
  linkId: string;
  linkVersionId: string;

  /**
   * Path into the source entity's properties.
   *
   * @example
   * "$.contents"
   * "$.parentPage"
   */
  path: string;

  /**
   * Defines order between multiple link entities.
   *
   * @todo: consider using a fractional index so we don't need to update
   * multiple links when re-ordering. Then occasionally, you can do a re-balance
   * when re-ordering between two items with too low of a distance.
   */
  index?: number;
  sourceAccountId: string;
  sourceEntityId: string;

  appliedToSourceAt: Date;
  appliedToSourceByAccountId: string;

  removedFromSourceAt?: Date;
  removedFromSourceByAccountId?: string;

  destinationAccountId: string;

  destinationEntityId: string;

  updatedAt: Date;
  updatedByAccountId: string;
};

export type DbLinkWithIndex = DbLink & Required<Pick<DbLink, "index">>;

export type DbLinkVersion = {
  sourceAccountId: string;
  linkVersionId: string;
  linkId: string;
  index?: number;
  updatedAt: Date;
  updatedByAccountId: string;
};

export type DbAggregation = {
  aggregationId: string;
  aggregationVersionId: string;
  sourceAccountId: string;
  sourceEntityId: string;
  appliedToSourceAt: Date;
  appliedToSourceByAccountId: string;
  removedFromSourceAt?: Date;
  removedFromSourceByAccountId?: string;
  path: string;
  operation: object;
  updatedAt: Date;
  updatedByAccountId: string;
};

export type DbAggregationVersion = {
  sourceAccountId: string;
  aggregationVersionId: string;
  aggregationId: string;
  operation: object;
  updatedAt: Date;
  updatedByAccountId: string;
};

export type EntityTypeMeta = EntityMeta & {
  name: string;
};

export type EntityType = Omit<DbEntity, EntityTypeTypeFields> & {
  metadata: EntityTypeMeta;
  /**
   *  @todo make these non-optional if we figure a way of getting the EntityType entityType
   *    attached without recursion headaches. see https://github.com/hashintel/dev/pull/200
   */
  entityType?: EntityType | undefined | null;
  entityTypeId?: string | undefined | null;
  entityTypeName?: "EntityType";
  entityTypeVersionId?: string;
};

export type EntityVersion = {
  accountId: string;
  entityId: string;
  entityVersionId: string;
  updatedAt: Date;
  updatedByAccountId: string;
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

export type DbUserEmail = {
  address: string;
  verified: boolean;
  primary: boolean;
};

export type UserInfoProvidedAtSignup = {
  usingHow?: WayToUseHash;
};

export type DbUserProperties = {
  emails: DbUserEmail[];
  shortname?: string;
  preferredName?: string;
  infoProvidedAtSignup: UserInfoProvidedAtSignup;
};

export type DbOrgMembershipProperties = {
  responsibility: string;
};

export type DbFileProperties = {
  name: string;
  key: string;
  size: number;
  storageType: StorageType;
  mediaType: string;
  contentMd5?: string;
};

export type OrgInfoProvidedAtCreation = {
  orgSize: OrgSize;
};

export type DbOrgProperties = {
  shortname: string;
  name: string;
  infoProvidedAtCreation?: OrgInfoProvidedAtCreation;
};

export type Graph = {
  rootEntityVersionId: string;
  entities: EntityVersion[];
  links: {
    src: EntityVersion;
    dst: EntityVersion;
    fixed: boolean;
  }[];
};

export type DbTextProperties = {
  tokens: TextToken[];
};

export type DbBlockProperties = {
  componentId: string;
};

export type DbPageProperties = {
  archived?: boolean | null;
  summary?: string | null;
  title: string;
};

export type DbPageEntity = Omit<DbEntity, "properties"> & {
  properties: DbPageProperties;
};

export type DbUnknownEntity = DbEntity;

export interface DbAdapter extends DataSource, DbClient {
  /** Initiate a new database transaction. All `DbAdapter` methods called within
   * the provided callback `fn` are executed within the same transaction.
   * */
  transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T>;
}

/**
 * Generic interface to the database.
 */
export interface DbClient {
  /**
   * Create an entity type.
   * @param params.name the type name - must be unique in the specified account
   * @param params.schema JSON schema fields (e.g. 'properties', 'definition')
   */
  createEntityType(params: {
    accountId: string;
    createdByAccountId: string;
    name: string;
    schema: Record<string, any>;
  }): Promise<EntityType>;

  /**
   * Create a new entity. If `entityVersionId` is not provided it will be automatically
   * generated. To create a versioned entity, set the optional parameter `versioned` to
   * `true`. One of `entityTypeId`, `entityTypeVersionId` or `systemTypeName` must be
   * provided.
   * @throws: `DbInvalidLinksError` if the entity's properties contain a link to an
   *          entity which does not exist.
   * */
  createEntity(params: {
    accountId: string;
    createdByAccountId: string;
    entityId?: string;
    entityVersionId?: string;
    entityTypeId?: string;
    entityTypeVersionId?: string;
    systemTypeName?: SystemType;
    versioned: boolean;
    properties: any;
  }): Promise<DbEntity>;

  /**
   * Get an entity's accountId using its entityVersionId
   */
  getEntityAccountId(params: {
    entityId: string;
    entityVersionId?: string;
  }): Promise<string>;

  /** Get an entity by ID in a given account. If `lock` is set to `true`, then no
   * other client may access the entity until the current transaction has ended.
   */
  getEntity(
    params: {
      accountId: string;
      entityVersionId: string;
    },
    lock?: boolean,
  ): Promise<DbEntity | undefined>;

  /**
   * Get the latest version of an entity.
   * @todo: this function can be combined with getEntity after the metadata_id &
   *   history_id merge.
   * */
  getEntityLatestVersion(params: {
    accountId: string;
    entityId: string;
  }): Promise<DbEntity | undefined>;

  /**
   * Get an entityType by a specific version ID
   * @todo should this be merged with getEntityTypeLatestVersion?
   */
  getEntityType(params: {
    entityTypeVersionId: string;
  }): Promise<EntityType | null>;

  /**
   * Get an entityType by its fixed id.
   * @todo should this also handle requests for a specific version?
   *    Should be consistent with how getEntity/getEntityLatestVersion are merged.
   */
  getEntityTypeLatestVersion(params: {
    entityTypeId: string;
  }): Promise<EntityType | null>;

  /**
   * Get an `EntityType` by the componentId property of its schema.
   * @param params.componentId the component ID that could exist on an entity Type.
   */
  getEntityTypeByComponentId(params: {
    componentId: string;
  }): Promise<EntityType | null>;

  /**
   * Get an `EntityType` by its Schema ID, i.e. the value for `$id` on the schema.
   * @param params.schema$id the schema ID that exists on an `EntityType`.
   */
  getEntityTypeBySchema$id(params: {
    schema$id: string;
  }): Promise<EntityType | null>;

  /**
   * Get all types that inherit from a specific type.
   */
  getEntityTypeChildren(params: { schemaRef: string }): Promise<EntityType[]>;

  /**
   * Get the latest version of a system entity type.
   * */
  getSystemTypeLatestVersion(params: {
    systemTypeName: SystemType;
  }): Promise<EntityType>;

  /**
   * Update an entity type.
   * Creates a new version of the entity type for any update.
   * @param params.entityId the fixed id of the entityType
   * @param params.entityVersionId optionally provide the version the update is based on.
   * @param params.updatedByAccountId The account id of the user performing the update
   *   the function will throw an error if this does not match the latest in the database.
   * @param params.schema JSON schema fields (e.g. 'properties', 'definition).
   *    The unique name should be under "title"
   */
  updateEntityType(params: {
    accountId: string; // @todo: can we remove this?
    entityId: string;
    updatedByAccountId: string;
    entityVersionId?: string;
    schema: Record<string, any>;
  }): Promise<EntityType>;

  /**
   * Update an entity, either versioned or non-versioned. Note: the update is always
   * applied to the latest version of the entity.
   * @param params.accountId the account ID the entity belongs to.
   * @param params.entityId the entity's fixed ID.
   * @param params.properties the entity's new properties.
   * @param params.updatedByAccountId the account id of the user that is updating the entity
   * @returns the entity's updated state.
   * @throws `DbEntityNotFoundError` if the entity does not exist.
   * @throws `DbInvalidLinksError` if the entity's new properties link to an entity which
   *          does not exist.
   */
  updateEntity(params: {
    accountId: string;
    entityId: string;
    properties: any;
    updatedByAccountId: string;
  }): Promise<DbEntity>;

  /**
   * Update an entity's account id, on all versions
   * @param params.originalAccountId the account ID the entity belongs to.
   * @param params.entityId the entity's fixed ID.
   * @param params.newAccountId the new account id to transfer the entity to
   */
  updateEntityAccountId(params: {
    originalAccountId: string;
    entityId: string;
    newAccountId: string;
  }): Promise<void>;

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
  }): Promise<DbEntity | null>;

  /** Get the user by their shortname. */
  getUserByShortname(params: { shortname: string }): Promise<DbEntity | null>;

  /** Get the org by its shortname. */
  getOrgByShortname(params: { shortname: string }): Promise<DbEntity | null>;

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
  }): Promise<DbEntity[]>;

  /**
   * Get all entities of a given system type, in an account.
   * @todo handle this instead by sending a cached result from systemTypeId into getEntitiesByType
   * @param params.accountId the account to retrieve entities from
   * @param params.latestOnly optionally limit results to the latest version of each entity
   * @param params.systemTypeName the name of the system type
   * */
  getEntitiesBySystemType(params: {
    accountId: string;
    latestOnly?: boolean;
    systemTypeName: SystemType;
  }): Promise<DbEntity[]>;

  /**
   * Get all account type entities (User or Account).
   */
  getAllAccounts(): Promise<DbEntity[]>;

  /** Checks whether an account exists on the account table.
   * @param params.accountId the account id to check
   * @returns true if the account exists, false if not
   * */
  accountExists(params: { accountId: string }): Promise<boolean>;

  /**
   * Update the metadata shared across all versions of an entity. Throws a
   * `DbEntityNotFoundError` if the entity does not exist.
   * */
  updateEntityMetadata(params: {
    accountId: string;
    entityId: string;
    extra: any;
  }): Promise<EntityMeta>;

  /** Create a link */
  createLink(params: {
    createdByAccountId: string;
    path: string;
    index?: number;
    sourceAccountId: string;
    sourceEntityId: string;
    sourceEntityVersionIds: Set<string>;
    destinationAccountId: string;
    destinationEntityId: string;
  }): Promise<DbLink>;

  /**
   * Updates the index of a link (and the other affected links)
   *
   * @param params.sourceAccountId the account ID of the source entity
   * @param params.linkId the link ID of the link
   * @param params.updatedIndex the updated index of the link
   * @param params.updatedByAccountId the account ID of the user that is updating the entity
   */
  updateLink(params: {
    sourceAccountId: string;
    linkId: string;
    updatedIndex: number;
    updatedByAccountId: string;
  }): Promise<DbLink>;

  getLink(params: {
    sourceAccountId: string;
    linkId: string;
  }): Promise<DbLink | null>;

  deleteLink(params: {
    deletedByAccountId: string;
    sourceAccountId: string;
    linkId: string;
  }): Promise<void>;

  /**
   * Gets all the outgoing links of an entity.
   *
   * Note: when the entity is versioned, the currently active links are returned by default. To get
   * the outgoing links of the versioned entity at a particular point in time in its history, a
   * timestamp can be specified using the `params.activeAt` parameter.
   *
   * @param params.accountId the account ID of the source entity
   * @param params.entityId the entity ID of the source entity
   * @param params.activeAt the timestamp at which the outgoing links were active, when the source entity is versioned (optional)
   * @param params.path the path of the outgoing links (optional)
   */
  getEntityOutgoingLinks(params: {
    accountId: string;
    entityId: string;
    activeAt?: Date;
    path?: string;
  }): Promise<DbLink[]>;

  /**
   * Gets all the incoming links of an entity.
   *
   * @todo: support getting the incoming links of an entity at
   * a particular point in its history
   *
   * @param params.accountId the account ID of the destination entity
   * @param params.entityId the entity ID of the destination entity
   */
  getEntityIncomingLinks(params: {
    accountId: string;
    entityId: string;
  }): Promise<DbLink[]>;

  /** Create a verification code */
  createVerificationCode(params: {
    accountId: string;
    userId: string;
    code: string;
    emailAddress: string;
  }): Promise<VerificationCode>;

  /**
   * Create an aggregation for an entity.
   *
   * @param {string} params.sourceAccountId - the account id of the source entity
   * @param {string} params.sourceEntityId - the entity id of the source entity
   * @param {string} params.path - the aggregation path
   * @param {object} params.operation - the aggregation operation
   * @param {string} params.createdByAccountId - the account id of the user that created the aggregation (equivalent to the `appliedToSourceByAccountId` field on the aggregation)
   * @returns {Promise<DbAggregation>} the created aggregation
   */
  createAggregation(params: {
    sourceAccountId: string;
    sourceEntityId: string;
    path: string;
    operation: object;
    createdByAccountId: string;
  }): Promise<DbAggregation>;

  /**
   * Update the operation of an existing aggregation.
   *
   * @param {string} params.sourceAccountId - the account id of the source entity
   * @param {string} params.aggregationId - the id of the aggregation
   * @param {object} params.operation - the updated aggregation operation
   * @param {string} params.updatedByAccountId - the account id of the user that is updating the aggregation
   * @returns {Promise<DbAggregation>} the updated aggregation
   */
  updateAggregationOperation(params: {
    sourceAccountId: string;
    aggregationId: string;
    updatedOperation: object;
    updatedByAccountId: string;
  }): Promise<DbAggregation>;

  /**
   * Get an aggregation by its aggregation id.
   *
   * @param {string} params.sourceAccountId - the account id of the source entity
   * @param {string} params.aggregationId - the id of the aggregation
   * @returns {Promise<DbAggregation | null>} the aggregation with if found in the datastore, otherwise `null`
   */
  getAggregation(params: {
    sourceAccountId: string;
    aggregationId: string;
  }): Promise<DbAggregation | null>;

  /**
   * Get an aggregation by its source entity and path.
   *
   * @param {string} params.sourceAccountId - the account id of the source entity
   * @param {string} params.sourceEntityId - the entity id of the source entity
   * @param {string} params.path - the aggregation path
   * @param {Date} [params.activeAt] - the timestamp at which the aggregation was active, when the source entity is versioned
   * @returns {Promise<DbAggregation | null>} the aggregation if found in the datastore, otherwise `null`
   */
  getEntityAggregationByPath(params: {
    sourceAccountId: string;
    sourceEntityId: string;
    path: string;
    activeAt?: Date;
  }): Promise<DbAggregation | null>;

  /**
   * Get all aggregations for an entity.
   *
   * @param {string} params.sourceAccountId - the account id of the source entity
   * @param {string} params.sourceEntityId - the entity id of the source entity
   * @param {Date} [params.activeAt] - the timestamp at which the aggregations were active, when the source entity is versioned
   * @returns {Promise<DbAggregation[]>} the aggregations of the entity
   */
  getEntityAggregations(params: {
    sourceAccountId: string;
    sourceEntityId: string;
    activeAt?: Date;
  }): Promise<DbAggregation[]>;

  /**
   * Delete an existing aggregation.
   *
   * @param {string} params.sourceAccountId - the account id of the source entity
   * @param {string} params.aggregationId - the id of the aggregation
   * @param {string} params.deletedByAccountId - the account id of the user that deleted the aggregation  (equivalent to the `removedFromSourceByAccountId` field of an aggregation)
   * @returns {Promise<void>}
   */
  deleteAggregation(params: {
    sourceAccountId: string;
    aggregationId: string;
    deletedByAccountId: string;
  }): Promise<void>;

  /** Get a verification code (it may be invalid!) */
  getVerificationCode(params: { id: string }): Promise<VerificationCode | null>;

  /** Gets all verification codes associated with a user, optionally filtering by minimum creation date */
  getUserVerificationCodes(params: {
    userEntityId: string;
    createdAfter?: Date;
  }): Promise<VerificationCode[]>;

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
   * getEntityHistory returns the sorted version timeline of an entity given its
   * `entityId`.
   * */
  getEntityHistory(params: {
    accountId: string;
    entityId: string;
    order: "asc" | "desc";
  }): Promise<EntityVersion[]>;

  /** Get multiple entities by their account ID and entity ID. */
  getEntities(
    entities: {
      accountId: string;
      entityId: string;
      entityVersionId?: string;
    }[],
  ): Promise<DbEntity[]>;

  /** Get all entities associated with the given account ID. */
  getAccountEntities(params: {
    accountId: string;
    entityTypeFilter?: {
      componentId?: string;
      entityTypeId?: string;
      entityTypeVersionId?: string;
      systemTypeName?: SystemType;
    };
  }): Promise<DbEntity[]>;

  /**
   * Get entity types associated with a given accountId.
   * Optionally include other types the account uses.
   * */
  getAccountEntityTypes(params: {
    accountId: string;
    includeOtherTypesInUse?: boolean | null;
  }): Promise<EntityType[]>;

  /** Acquire a transaction-scoped lock on the provided entity ID. */
  acquireEntityLock(params: { entityId: string }): Promise<null>;

  /** Get all implied version history sub-graphs for a given root entity. */
  getImpliedEntityHistory(params: {
    accountId: string;
    entityId: string;
  }): Promise<Graph[]>;

  /**
   * Get all ancestors of a given entity at a specified depth.
   * @param params.accountId: the account ID of the reference entity.
   * @param params.entityId: the ID of the reference entity.
   * @param params.depth: the length of the path from the ancestor to the reference.
   * */
  getAncestorReferences(params: {
    accountId: string;
    entityId: string;
    depth?: number;
  }): Promise<{ accountId: string; entityId: string }[]>;

  /** Get the accountId of the system account. */
  getSystemAccountId(): Promise<string>;

  /**
   * Get all entities which the given entity links to.
   * @param params.accountId: the account ID of the reference entity.
   * @param params.entityId: the ID of the reference entity.
   * @param params.entityVersionId: the version ID of the reference entity.
   * */
  getChildren(params: {
    accountId: string;
    entityId: string;
    entityVersionId: string;
  }): Promise<DbEntity[]>;
}
