import { sql } from "slonik";

import {
  DbAggregation,
  DbClient,
  DbLink,
  DbEntity,
  EntityMeta,
  EntityType,
  EntityVersion,
  VerificationCode,
} from "../adapter";
import { genId, exactlyOne } from "../../util";
import { Connection } from "./types";
import {
  accountExists,
  getEntityAccountId,
  getSystemAccountId,
  insertAccount,
  insertEntityAccount,
} from "./account";
import {
  getAccountEntityTypes,
  getEntityType,
  getEntityTypeByComponentId,
  getEntityTypeBySchema$id,
  getEntityTypeChildren,
  getEntityTypeLatestVersion,
  getSystemTypeLatestVersion,
  insertEntityType,
  insertEntityTypeVersion,
  selectSystemEntityTypeIds,
  updateVersionedEntityType,
} from "./entitytypes";
import { insertEntityMetadata, updateEntityMetadata } from "./metadata";
import {
  getAllAccounts,
  getEntities,
  getEntitiesByTypeAllVersions,
  getEntitiesByTypeLatestVersion,
  getEntity,
  getEntityHistory,
  getEntityLatestVersion,
  getAncestorReferences,
  getChildren,
  insertEntityVersion,
  acquireEntityLock,
  updateEntity,
  updateEntityAccountId,
  getAccountEntities,
} from "./entity";
import { getEntityOutgoingLinks } from "./link/getEntityOutgoingLinks";
import { getLink } from "./link/getLink";
import { createLink } from "./link/createLink";
import { deleteLink } from "./link/deleteLink";
import { getUserByEmail, getUserByShortname } from "./user";
import {
  insertVerificationCode,
  getVerificationCode,
  incrementVerificationCodeAttempts,
  pruneVerificationCodes,
  setVerificationCodeToUsed,
  getUserVerificationCodes,
} from "./verificationCode";
import { getImpliedEntityHistory } from "./history";
import { generateSchema$id } from "../../model/entityType.util";
import { SystemType } from "../../types/entityTypes";
import { Visibility } from "../../graphql/apiTypes.gen";
import { getOrgByShortname } from "./org";
import { DbEntityTypeNotFoundError } from "../errors";
import { createAggregation } from "./aggregation/createAggregation";
import { getEntityAggregations } from "./aggregation/getEntityAggregations";
import { updateAggregationOperation } from "./aggregation/updateAggregationOperation";
import { deleteAggregation } from "./aggregation/deleteAggregation";
import { getEntityAggregation } from "./aggregation/getEntityAggregation";
import { requireTransaction } from "./util";
import { getEntityIncomingLinks } from "./link/getEntityIncomingLinks";

export class PostgresClient implements DbClient {
  private conn: Connection;

  constructor(conn: Connection) {
    this.conn = conn;
  }

  get transaction(): <T>(
    handler: (connection: Connection) => Promise<T>,
  ) => Promise<T> {
    return requireTransaction(this.conn);
  }

  /** Create an entity type definition and return its uuid. */
  async createEntityType(
    params: Parameters<DbClient["createEntityType"]>[0],
  ): Promise<EntityType> {
    const { name, accountId, createdByAccountId, schema } = params;

    return this.transaction(async (conn) => {
      // The fixed type id
      const entityTypeId = genId();

      // The id to assign this (first) version
      const entityTypeVersionId = genId();

      const now = new Date();

      // Ensure that the schema $id refers to the correct accountId + entityId
      schema.$id = generateSchema$id(accountId, entityTypeId);

      const entityType: EntityType = {
        accountId,
        entityId: entityTypeId,
        entityVersionId: entityTypeVersionId,
        entityTypeName: "EntityType",
        properties: schema,
        metadata: {
          versioned: true,
          name,
          extra: {},
        },
        createdAt: now,
        createdByAccountId,
        updatedAt: now,
        updatedByAccountId: createdByAccountId,
        visibility: Visibility.Public,
      };

      // create the fixed record for the type
      // @todo: insertEntityType needs name in its parameter object, this could be changes to take `EntityType` metadata.
      await insertEntityType(conn, { ...entityType, name });

      // create the first version
      await insertEntityTypeVersion(conn, entityType);

      return entityType;
    });
  }

  async getSystemTypeLatestVersion(params: {
    systemTypeName: SystemType;
  }): Promise<EntityType> {
    return getSystemTypeLatestVersion(this.conn, params);
  }

  /**
   * Create a new entity.
   * @throws: `DbInvalidLinksError` if the entity's properties contain a link to an
   *          entity which does not exist.
   */
  async createEntity(params: {
    accountId: string;
    createdByAccountId: string;
    entityId?: string;
    entityVersionId?: string;
    entityTypeId?: string;
    entityTypeVersionId?: string;
    systemTypeName?: SystemType;
    versioned: boolean;
    properties: any;
  }): Promise<DbEntity> {
    return await this.transaction(async (conn) => {
      // Create the account if it does not already exist
      // TODO: this should be performed in a "createAccount" function, or similar.
      await insertAccount(conn, { accountId: params.accountId });

      const { entityTypeId, entityTypeVersionId, systemTypeName } = params;

      if (!exactlyOne(entityTypeId, entityTypeVersionId, systemTypeName)) {
        throw new Error(
          "Exactly one of entityTypeId, entityTypeVersionId or systemTypeName must be provided",
        );
      }

      const entityType = systemTypeName
        ? await getSystemTypeLatestVersion(conn, { systemTypeName })
        : entityTypeVersionId
        ? await getEntityType(conn, { entityVersionId: entityTypeVersionId })
        : await getEntityTypeLatestVersion(conn, { entityId: entityTypeId! });
      if (!entityType) {
        throw new DbEntityTypeNotFoundError(params);
      }

      // @todo: if versionId is provided, check that it's a UUID
      const entityVersionId = params.entityVersionId ?? genId();
      const now = new Date();
      const entityId = params.entityId ?? genId();
      const entity: DbEntity = {
        accountId: params.accountId,
        entityId,
        entityVersionId,
        entityType,
        entityTypeId: entityType.entityId,
        entityTypeVersionId: entityType.entityVersionId,
        entityTypeName: entityType.properties.title,
        properties: params.properties,
        metadata: {
          versioned: params.versioned,
          extra: {}, // @todo: decide what to put in here
        },
        createdByAccountId: params.createdByAccountId,
        createdAt: now,
        updatedByAccountId: params.createdByAccountId,
        updatedAt: now,
        visibility: Visibility.Public,
      };

      // Defer FKs until end of transaction so we can insert concurrently
      await conn.query(sql`
        set constraints
          entity_versions_account_id_entity_id_fk,
          entity_account_account_id_entity_version_id_fk,
          incoming_links_destination_account_id_destination_entity_id_fk,
          incoming_links_source_account_id_link_id_fk
        deferred
      `);

      await Promise.all([
        insertEntityMetadata(conn, {
          accountId: entity.accountId,
          entityId: entity.entityId,
          createdAt: entity.createdAt,
          createdByAccountId: entity.createdByAccountId,
          ...entity.metadata,
        }),

        /** @todo validate entity against the schema of its entityType */
        insertEntityVersion(conn, entity),

        // Make a reference to this entity's account in the `entity_account` lookup table
        insertEntityAccount(conn, entity),
      ]);

      return entity;
    });
  }

  async getEntityAccountId(params: {
    entityId: string;
    entityVersionId?: string;
  }): Promise<string> {
    return getEntityAccountId(this.conn, params);
  }

  async getEntity(
    params: {
      accountId: string;
      entityVersionId: string;
    },
    lock: boolean = false,
  ): Promise<DbEntity | undefined> {
    return (await getEntity(this.conn, params, lock)) || undefined;
  }

  async getEntityLatestVersion(params: {
    accountId: string;
    entityId: string;
  }): Promise<DbEntity | undefined> {
    return (await getEntityLatestVersion(this.conn, params)) || undefined;
  }

  async getEntityType(
    params: Parameters<DbClient["getEntityType"]>[0],
  ): ReturnType<DbClient["getEntityType"]> {
    return await getEntityType(this.conn, {
      entityVersionId: params.entityTypeVersionId,
    });
  }

  async getEntityTypeLatestVersion(params: {
    entityTypeId: string;
  }): Promise<EntityType | null> {
    return (
      (await getEntityTypeLatestVersion(this.conn, {
        entityId: params.entityTypeId,
      })) || null
    );
  }

  async getEntityTypeByComponentId(
    params: Parameters<DbClient["getEntityTypeByComponentId"]>[0],
  ): ReturnType<DbClient["getEntityTypeByComponentId"]> {
    return await getEntityTypeByComponentId(this.conn, params);
  }

  async getEntityTypeBySchema$id(
    params: Parameters<DbClient["getEntityTypeBySchema$id"]>[0],
  ): ReturnType<DbClient["getEntityTypeBySchema$id"]> {
    return await getEntityTypeBySchema$id(this.conn, params);
  }

  async getEntityTypeChildren(
    params: Parameters<DbClient["getEntityTypeChildren"]>[0],
  ): ReturnType<DbClient["getEntityTypeChildren"]> {
    return await getEntityTypeChildren(this.conn, params);
  }

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
  async updateEntity(params: {
    accountId: string;
    entityId: string;
    properties: any;
    updatedByAccountId: string;
  }): Promise<DbEntity> {
    return updateEntity(this.conn, params);
  }

  async updateEntityAccountId(params: {
    originalAccountId: string;
    entityId: string;
    newAccountId: string;
  }): Promise<void> {
    await updateEntityAccountId(this.conn, params);
  }

  async updateEntityType(
    params: Parameters<DbClient["updateEntityType"]>[0],
  ): ReturnType<DbClient["updateEntityType"]> {
    const { entityId, entityVersionId, schema } = params;

    const entity = entityVersionId
      ? await getEntityType(this.conn, { entityVersionId })
      : await getEntityTypeLatestVersion(this.conn, params);

    if (!entity) {
      throw new Error(`Could not find entityType with id ${entityId}`);
    }
    if (entityVersionId && entityVersionId !== entity.entityVersionId) {
      throw new Error(
        `Provided entityVersionId ${entityVersionId} does not match latest: ${entity.entityVersionId}`,
      );
    }

    const nameToSet = schema.title;

    if (typeof nameToSet !== "string" || nameToSet === "") {
      throw new Error("Schema requires a name set via a 'title' property");
    }

    const now = new Date();

    // Ensure that the schema $id refers to the correct accountId + entityId
    schema.$id = generateSchema$id(entity.accountId, entityId);

    const newType: EntityType = {
      ...entity,
      entityVersionId: genId(),
      updatedAt: now,
      updatedByAccountId: params.updatedByAccountId,
      properties: schema,
    };

    if (entity.metadata.versioned) {
      await updateVersionedEntityType(this.conn, {
        ...newType,
        name: nameToSet,
      });
    } else {
      throw new Error("updates not implemented for non-versioned entity types");
    }

    return newType;
  }

  async getUserByEmail(params: {
    email: string;
    verified?: boolean;
    primary?: boolean;
  }) {
    return await getUserByEmail(this.conn, params);
  }

  async getUserByShortname(params: { shortname: string }) {
    return await getUserByShortname(this.conn, params);
  }

  async getOrgByShortname(params: { shortname: string }) {
    return await getOrgByShortname(this.conn, params);
  }

  async getEntitiesBySystemType(params: {
    accountId: string;
    systemTypeName: SystemType;
    latestOnly?: boolean;
  }): Promise<DbEntity[]> {
    const { entity_type_id: entityTypeId } = await this.conn.one(
      selectSystemEntityTypeIds(params),
    );
    const queryParams = {
      entityTypeId: entityTypeId as string,
      accountId: params.accountId,
    };
    // This will get entities with the given system type
    // - either 'latestOnly' or all versions of the entity -
    // across ALL versions of the system type in either case.
    return params.latestOnly
      ? await getEntitiesByTypeLatestVersion(this.conn, queryParams)
      : await getEntitiesByTypeAllVersions(this.conn, queryParams);
  }

  /** Get all entities of a given type in a given account. */
  async getEntitiesByType(params: {
    accountId: string;
    entityTypeId: string;
    entityTypeVersionId?: string;
    latestOnly: boolean;
  }): Promise<DbEntity[]> {
    return params.latestOnly
      ? await getEntitiesByTypeLatestVersion(this.conn, params)
      : await getEntitiesByTypeAllVersions(this.conn, params);
  }

  async accountExists(params: { accountId: string }): Promise<boolean> {
    return await accountExists(this.conn, params);
  }

  /**  Get all account type entities (User or Org). */
  async getAllAccounts(): Promise<DbEntity[]> {
    return await getAllAccounts(this.conn);
  }

  async updateEntityMetadata(params: {
    accountId: string;
    entityId: string;
    extra: any;
  }): Promise<EntityMeta> {
    return await updateEntityMetadata(this.conn, params);
  }

  async createLink(params: {
    createdByAccountId: string;
    path: string;
    index?: number;
    sourceAccountId: string;
    sourceEntityId: string;
    sourceEntityVersionIds: Set<string>;
    destinationAccountId: string;
    destinationEntityId: string;
    destinationEntityVersionId?: string;
  }): Promise<DbLink> {
    return await createLink(this.conn, params);
  }

  async getLink(params: {
    sourceAccountId: string;
    linkId: string;
  }): Promise<DbLink | null> {
    return await getLink(this.conn, params);
  }

  async deleteLink(params: {
    deletedByAccountId: string;
    sourceAccountId: string;
    linkId: string;
  }): Promise<void> {
    return await deleteLink(this.conn, params);
  }

  async createAggregation(
    params: Parameters<DbClient["createAggregation"]>[0],
  ): Promise<DbAggregation> {
    return await createAggregation(this.conn, params);
  }

  async updateAggregationOperation(
    params: Parameters<DbClient["updateAggregationOperation"]>[0],
  ): Promise<DbAggregation> {
    return await updateAggregationOperation(this.conn, params);
  }

  async getEntityAggregation(
    params: Parameters<DbClient["getEntityAggregation"]>[0],
  ): Promise<DbAggregation | null> {
    return await getEntityAggregation(this.conn, params);
  }

  async getEntityAggregations(
    params: Parameters<DbClient["getEntityAggregations"]>[0],
  ): Promise<DbAggregation[]> {
    return await getEntityAggregations(this.conn, params);
  }

  async deleteAggregation(
    params: Parameters<DbClient["deleteAggregation"]>[0],
  ): Promise<void> {
    return await deleteAggregation(this.conn, params);
  }

  async getEntityOutgoingLinks(
    params: Parameters<DbClient["getEntityOutgoingLinks"]>[0],
  ): Promise<DbLink[]> {
    return await getEntityOutgoingLinks(this.conn, params);
  }

  async getEntityIncomingLinks(
    params: Parameters<DbClient["getEntityIncomingLinks"]>[0],
  ): Promise<DbLink[]> {
    return await getEntityIncomingLinks(this.conn, params);
  }

  async createVerificationCode(params: {
    accountId: string;
    userId: string;
    code: string;
    emailAddress: string;
  }): Promise<VerificationCode> {
    const id = genId();
    const createdAt = new Date();
    await insertVerificationCode(this.conn, { ...params, id, createdAt });
    return { id, ...params, createdAt, numberOfAttempts: 0, used: false };
  }

  async getVerificationCode(params: {
    id: string;
  }): Promise<VerificationCode | null> {
    return await getVerificationCode(this.conn, params);
  }

  async getUserVerificationCodes(params: {
    userEntityId: string;
    createdAfter?: Date;
  }): Promise<VerificationCode[]> {
    return await getUserVerificationCodes(this.conn, params);
  }

  async incrementVerificationCodeAttempts(params: {
    id: string;
    userId: string;
  }): Promise<void> {
    return await incrementVerificationCodeAttempts(this.conn, params);
  }

  async setVerificationCodeToUsed(params: {
    id: string;
    userId: string;
  }): Promise<void> {
    return await setVerificationCodeToUsed(this.conn, params);
  }

  async pruneVerificationCodes(params: {
    maxAgeInMs: number;
  }): Promise<number> {
    return await pruneVerificationCodes(this.conn, params);
  }

  async getEntityHistory(params: {
    accountId: string;
    entityId: string;
    order: "asc" | "desc";
  }): Promise<EntityVersion[]> {
    return await getEntityHistory(this.conn, params);
  }

  async getAccountEntities(
    params: Parameters<DbClient["getAccountEntities"]>[0],
  ): ReturnType<DbClient["getAccountEntities"]> {
    const systemAccountId = await this.getSystemAccountId();

    return await getAccountEntities(this.conn, { systemAccountId, ...params });
  }

  async getEntities(
    entities: {
      accountId: string;
      entityId: string;
      entityVersionId?: string;
    }[],
  ): Promise<DbEntity[]> {
    return await getEntities(this.conn, entities);
  }

  async getAccountEntityTypes(params: {
    accountId: string;
    includeOtherTypesInUse?: boolean | null;
  }): Promise<EntityType[]> {
    return await getAccountEntityTypes(this.conn, params);
  }

  async acquireEntityLock(params: { entityId: string }): Promise<null> {
    return acquireEntityLock(this.conn, params);
  }

  async getImpliedEntityHistory(params: {
    accountId: string;
    entityId: string;
  }) {
    return getImpliedEntityHistory(this.conn, params);
  }

  async getAncestorReferences(
    params: Parameters<DbClient["getAncestorReferences"]>[0],
  ): ReturnType<DbClient["getAncestorReferences"]> {
    return getAncestorReferences(this.conn, params);
  }

  async getSystemAccountId() {
    return getSystemAccountId(this.conn);
  }

  async getChildren(params: {
    accountId: string;
    entityId: string;
    entityVersionId: string;
  }) {
    return getChildren(this.conn, params);
  }
}
