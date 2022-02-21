import { sql } from "slonik";

import {
  DBAggregation,
  DBClient,
  DBLink,
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
  getJsonSchemaBySchema$id,
  getEntityTypeChildren,
  getEntityTypeParents,
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
import {
  getEntitiesByTypeWithOutgoingEntityIds,
  getEntityOutgoingLinks,
  getEntityWithOutgoingEntityIds,
} from "./link/getEntityOutgoingLinks";
import { getLink, getLinkByEntityId } from "./link/getLink";
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
import { JsonSchemaCompiler } from "../../lib/schemas/jsonSchema";
import { SystemType } from "../../types/entityTypes";
import { Visibility } from "../../graphql/apiTypes.gen";
import { getOrgByShortname } from "./org";
import { DbEntityTypeNotFoundError } from "../errors";
import { createAggregation } from "./aggregation/createAggregation";
import { getEntityAggregations } from "./aggregation/getEntityAggregations";
import { updateAggregationOperation } from "./aggregation/updateAggregationOperation";
import { deleteAggregation } from "./aggregation/deleteAggregation";
import { getEntityAggregation } from "./aggregation/getEntityAggregation";
import { transaction } from "./util";

export class PostgresClient implements DBClient {
  private conn: Connection;

  constructor(conn: Connection) {
    this.conn = conn;
  }

  get transaction(): <T>(
    handler: (connection: Connection) => Promise<T>,
  ) => Promise<T> {
    return transaction(this.conn);
  }

  /** Create an entity type definition and return its uuid. */
  async createEntityType(params: {
    name: string;
    accountId: string;
    createdByAccountId: string;
    description?: string;
    schema?: Record<string, any>;
  }): Promise<EntityType> {
    const { name, accountId, createdByAccountId, description, schema } = params;

    return this.transaction(async (conn) => {
      // The fixed type id
      const entityTypeId = genId();

      // The id to assign this (first) version
      const entityTypeVersionId = genId();

      // Conn is used here to prevent transaction-mismatching.
      // this.conn is a parent of this transaction conn at this time.
      const jsonSchemaCompiler = new JsonSchemaCompiler(async (url) => {
        return getJsonSchemaBySchema$id(conn, url);
      });

      const now = new Date();
      const properties = await jsonSchemaCompiler.jsonSchema(
        name,
        accountId,
        entityTypeId,
        schema,
        description,
      );
      const entityType: EntityType = {
        accountId,
        entityId: entityTypeId,
        entityVersionId: entityTypeVersionId,
        entityTypeName: "EntityType",
        properties,
        metadata: {
          extra: {},
          versioned: true,
        },
        createdAt: now,
        createdByAccountId,
        updatedAt: now,
        updatedByAccountId: createdByAccountId,
        visibility: Visibility.Public,
      };

      // create the fixed record for the type
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
    params: Parameters<DBClient["getEntityTypeByComponentId"]>[0],
  ): ReturnType<DBClient["getEntityTypeByComponentId"]> {
    return await getEntityTypeByComponentId(this.conn, params);
  }

  async getEntityTypeBySchema$id(
    params: Parameters<DBClient["getEntityTypeBySchema$id"]>[0],
  ): ReturnType<DBClient["getEntityTypeBySchema$id"]> {
    return await getEntityTypeBySchema$id(this.conn, params);
  }

  async getEntityTypeChildren(
    params: Parameters<DBClient["getEntityTypeChildren"]>[0],
  ): ReturnType<DBClient["getEntityTypeChildren"]> {
    return await getEntityTypeChildren(this.conn, params);
  }

  async getEntityTypeParents(
    params: Parameters<DBClient["getEntityTypeParents"]>[0],
  ): ReturnType<DBClient["getEntityTypeParents"]> {
    return await getEntityTypeParents(this.conn, params);
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
    params: Parameters<DBClient["updateEntityType"]>[0],
  ): ReturnType<DBClient["updateEntityType"]> {
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

    const jsonSchemaCompiler = new JsonSchemaCompiler((url) => {
      return getJsonSchemaBySchema$id(this.conn, url);
    });

    const schemaToSet = await jsonSchemaCompiler.jsonSchema(
      nameToSet,
      entity.accountId,
      entityId,
      schema,
    );

    const now = new Date();

    const newType: EntityType = {
      ...entity,
      entityVersionId: genId(),
      updatedAt: now,
      updatedByAccountId: params.updatedByAccountId,
      properties: schemaToSet,
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

  async getEntitiesByTypeWithOutgoingEntityIds(
    params: Parameters<DBClient["getEntitiesByTypeWithOutgoingEntityIds"]>[0],
  ): ReturnType<DBClient["getEntitiesByTypeWithOutgoingEntityIds"]> {
    let entityTypeId: string = "";

    if (params.entityTypeId) {
      entityTypeId = params.entityTypeId;
    } else if (params.systemTypeName) {
      const { entity_type_id } = await this.conn.one<{
        entity_type_id: string;
      }>(selectSystemEntityTypeIds({ systemTypeName: params.systemTypeName }));

      entityTypeId = entity_type_id ?? "";
    }

    if (!entityTypeId) {
      throw new Error(
        `Did not receive valid entityTypeId or systemTypeName for fetching outgoing entity ids for entity by entityTypeId. entityTypeId = '${params.entityTypeId}' systemTypeName = '${params.systemTypeName}'`,
      );
    }

    const queryParams = {
      entityTypeId,
      accountId: params.accountId,
    };

    return await getEntitiesByTypeWithOutgoingEntityIds(this.conn, queryParams);
  }

  async getEntityWithOutgoingEntityIds(
    params: Parameters<DBClient["getEntityWithOutgoingEntityIds"]>[0],
  ): ReturnType<DBClient["getEntityWithOutgoingEntityIds"]> {
    return getEntityWithOutgoingEntityIds(this.conn, params);
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
  }): Promise<DBLink> {
    return await createLink(this.conn, params);
  }

  async getLink(params: {
    sourceAccountId: string;
    linkId: string;
  }): Promise<DBLink | null> {
    return await getLink(this.conn, params);
  }

  async getLinkByEntityId(
    params: Parameters<DBClient["getLinkByEntityId"]>[0],
  ): ReturnType<DBClient["getLinkByEntityId"]> {
    return await getLinkByEntityId(this.conn, params);
  }

  async deleteLink(params: {
    deletedByAccountId: string;
    sourceAccountId: string;
    linkId: string;
  }): Promise<void> {
    return await deleteLink(this.conn, params);
  }

  async createAggregation(
    params: Parameters<DBClient["createAggregation"]>[0],
  ): Promise<DBAggregation> {
    return await createAggregation(this.conn, params);
  }

  async updateAggregationOperation(
    params: Parameters<DBClient["updateAggregationOperation"]>[0],
  ): Promise<DBAggregation> {
    return await updateAggregationOperation(this.conn, params);
  }

  async getEntityAggregation(
    params: Parameters<DBClient["getEntityAggregation"]>[0],
  ): Promise<DBAggregation | null> {
    return await getEntityAggregation(this.conn, params);
  }

  async getEntityAggregations(
    params: Parameters<DBClient["getEntityAggregations"]>[0],
  ): Promise<DBAggregation[]> {
    return await getEntityAggregations(this.conn, params);
  }

  async deleteAggregation(
    params: Parameters<DBClient["deleteAggregation"]>[0],
  ): Promise<void> {
    return await deleteAggregation(this.conn, params);
  }

  async getEntityOutgoingLinks(params: {
    accountId: string;
    entityId: string;
    entityVersionId?: string;
    path?: string;
  }): Promise<DBLink[]> {
    return await getEntityOutgoingLinks(this.conn, params);
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
    params: Parameters<DBClient["getAccountEntities"]>[0],
  ): ReturnType<DBClient["getAccountEntities"]> {
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

  async getAncestorReferences(params: { accountId: string; entityId: string }) {
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
