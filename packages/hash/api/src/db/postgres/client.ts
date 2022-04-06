import { sql } from "slonik";

import { DbClient, DbEntity, EntityType } from "../adapter";
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
import { Visibility } from "../../graphql/apiTypes.gen";
import { getOrgByShortname } from "./org";
import { DbEntityTypeNotFoundError } from "../errors";
import { createAggregation } from "./aggregation/createAggregation";
import { getEntityAggregations } from "./aggregation/getEntityAggregations";
import { updateAggregationOperation } from "./aggregation/updateAggregationOperation";
import { deleteAggregation } from "./aggregation/deleteAggregation";
import { getAggregation } from "./aggregation/getAggregation";
import { getEntityAggregationByPath } from "./aggregation/getEntityAggregationByPath";
import { requireTransaction } from "./util";
import { getEntityIncomingLinks } from "./link/getEntityIncomingLinks";
import { updateLink } from "./link/updateLink";

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
  ): ReturnType<DbClient["createEntityType"]> {
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

  async getSystemTypeLatestVersion(
    params: Parameters<DbClient["getSystemTypeLatestVersion"]>[0],
  ): ReturnType<DbClient["getSystemTypeLatestVersion"]> {
    return getSystemTypeLatestVersion(this.conn, params);
  }

  /**
   * Create a new entity.
   * @throws: `DbInvalidLinksError` if the entity's properties contain a link to an
   *          entity which does not exist.
   */
  async createEntity(
    params: Parameters<DbClient["createEntity"]>[0],
  ): ReturnType<DbClient["createEntity"]> {
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

  async getEntityAccountId(
    params: Parameters<DbClient["getEntityAccountId"]>[0],
  ): ReturnType<DbClient["getEntityAccountId"]> {
    return getEntityAccountId(this.conn, params);
  }

  async getEntity(
    params: Parameters<DbClient["getEntity"]>[0],
    lock: boolean = false,
  ): ReturnType<DbClient["getEntity"]> {
    return (await getEntity(this.conn, params, lock)) || undefined;
  }

  async getEntityLatestVersion(
    params: Parameters<DbClient["getEntityLatestVersion"]>[0],
  ): ReturnType<DbClient["getEntityLatestVersion"]> {
    return (await getEntityLatestVersion(this.conn, params)) || undefined;
  }

  async getEntityType(
    params: Parameters<DbClient["getEntityType"]>[0],
  ): ReturnType<DbClient["getEntityType"]> {
    return await getEntityType(this.conn, {
      entityVersionId: params.entityTypeVersionId,
    });
  }

  async getEntityTypeLatestVersion(
    params: Parameters<DbClient["getEntityTypeLatestVersion"]>[0],
  ): ReturnType<DbClient["getEntityTypeLatestVersion"]> {
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
  async updateEntity(
    params: Parameters<DbClient["updateEntity"]>[0],
  ): ReturnType<DbClient["updateEntity"]> {
    return updateEntity(this.conn, params);
  }

  async updateEntityAccountId(
    params: Parameters<DbClient["updateEntityAccountId"]>[0],
  ): ReturnType<DbClient["updateEntityAccountId"]> {
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

  async getUserByEmail(
    params: Parameters<DbClient["getUserByEmail"]>[0],
  ): ReturnType<DbClient["getUserByEmail"]> {
    return await getUserByEmail(this.conn, params);
  }

  async getUserByShortname(
    params: Parameters<DbClient["getUserByShortname"]>[0],
  ): ReturnType<DbClient["getUserByShortname"]> {
    return await getUserByShortname(this.conn, params);
  }

  async getOrgByShortname(
    params: Parameters<DbClient["getOrgByShortname"]>[0],
  ): ReturnType<DbClient["getOrgByShortname"]> {
    return await getOrgByShortname(this.conn, params);
  }

  async getEntitiesBySystemType(
    params: Parameters<DbClient["getEntitiesBySystemType"]>[0],
  ): ReturnType<DbClient["getEntitiesBySystemType"]> {
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
  async getEntitiesByType(
    params: Parameters<DbClient["getEntitiesByType"]>[0],
  ): ReturnType<DbClient["getEntitiesByType"]> {
    return params.latestOnly
      ? await getEntitiesByTypeLatestVersion(this.conn, params)
      : await getEntitiesByTypeAllVersions(this.conn, params);
  }

  async accountExists(
    params: Parameters<DbClient["accountExists"]>[0],
  ): ReturnType<DbClient["accountExists"]> {
    return await accountExists(this.conn, params);
  }

  /**  Get all account type entities (User or Org). */
  async getAllAccounts(): ReturnType<DbClient["getAllAccounts"]> {
    return await getAllAccounts(this.conn);
  }

  async updateEntityMetadata(
    params: Parameters<DbClient["updateEntityMetadata"]>[0],
  ): ReturnType<DbClient["updateEntityMetadata"]> {
    return await updateEntityMetadata(this.conn, params);
  }

  async createLink(
    params: Parameters<DbClient["createLink"]>[0],
  ): ReturnType<DbClient["createLink"]> {
    return await createLink(this.conn, params);
  }

  async updateLink(
    params: Parameters<DbClient["updateLink"]>[0],
  ): ReturnType<DbClient["updateLink"]> {
    return await updateLink(this.conn, params);
  }

  async getLink(
    params: Parameters<DbClient["getLink"]>[0],
  ): ReturnType<DbClient["getLink"]> {
    return await getLink(this.conn, params);
  }

  async deleteLink(
    params: Parameters<DbClient["deleteLink"]>[0],
  ): ReturnType<DbClient["deleteLink"]> {
    return await deleteLink(this.conn, params);
  }

  async createAggregation(
    params: Parameters<DbClient["createAggregation"]>[0],
  ): ReturnType<DbClient["createAggregation"]> {
    return await createAggregation(this.conn, params);
  }

  async updateAggregationOperation(
    params: Parameters<DbClient["updateAggregationOperation"]>[0],
  ): ReturnType<DbClient["updateAggregationOperation"]> {
    return await updateAggregationOperation(this.conn, params);
  }

  async getEntityAggregationByPath(
    params: Parameters<DbClient["getEntityAggregationByPath"]>[0],
  ): ReturnType<DbClient["getEntityAggregationByPath"]> {
    return await getEntityAggregationByPath(this.conn, params);
  }

  async getEntityAggregations(
    params: Parameters<DbClient["getEntityAggregations"]>[0],
  ): ReturnType<DbClient["getEntityAggregations"]> {
    return await getEntityAggregations(this.conn, params);
  }

  async deleteAggregation(
    params: Parameters<DbClient["deleteAggregation"]>[0],
  ): ReturnType<DbClient["deleteAggregation"]> {
    return await deleteAggregation(this.conn, params);
  }

  async getEntityOutgoingLinks(
    params: Parameters<DbClient["getEntityOutgoingLinks"]>[0],
  ): ReturnType<DbClient["getEntityOutgoingLinks"]> {
    return await getEntityOutgoingLinks(this.conn, params);
  }

  async getEntityIncomingLinks(
    params: Parameters<DbClient["getEntityIncomingLinks"]>[0],
  ): ReturnType<DbClient["getEntityIncomingLinks"]> {
    return await getEntityIncomingLinks(this.conn, params);
  }

  async createVerificationCode(
    params: Parameters<DbClient["createVerificationCode"]>[0],
  ): ReturnType<DbClient["createVerificationCode"]> {
    const id = genId();
    const createdAt = new Date();
    await insertVerificationCode(this.conn, { ...params, id, createdAt });
    return { id, ...params, createdAt, numberOfAttempts: 0, used: false };
  }

  async getVerificationCode(
    params: Parameters<DbClient["getVerificationCode"]>[0],
  ): ReturnType<DbClient["getVerificationCode"]> {
    return await getVerificationCode(this.conn, params);
  }

  async getUserVerificationCodes(
    params: Parameters<DbClient["getUserVerificationCodes"]>[0],
  ): ReturnType<DbClient["getUserVerificationCodes"]> {
    return await getUserVerificationCodes(this.conn, params);
  }

  async incrementVerificationCodeAttempts(
    params: Parameters<DbClient["incrementVerificationCodeAttempts"]>[0],
  ): ReturnType<DbClient["incrementVerificationCodeAttempts"]> {
    return await incrementVerificationCodeAttempts(this.conn, params);
  }

  async setVerificationCodeToUsed(
    params: Parameters<DbClient["setVerificationCodeToUsed"]>[0],
  ): ReturnType<DbClient["setVerificationCodeToUsed"]> {
    return await setVerificationCodeToUsed(this.conn, params);
  }

  async pruneVerificationCodes(
    params: Parameters<DbClient["pruneVerificationCodes"]>[0],
  ): ReturnType<DbClient["pruneVerificationCodes"]> {
    return await pruneVerificationCodes(this.conn, params);
  }

  async getEntityHistory(
    params: Parameters<DbClient["getEntityHistory"]>[0],
  ): ReturnType<DbClient["getEntityHistory"]> {
    return await getEntityHistory(this.conn, params);
  }

  async getAccountEntities(
    params: Parameters<DbClient["getAccountEntities"]>[0],
  ): ReturnType<DbClient["getAccountEntities"]> {
    const systemAccountId = await this.getSystemAccountId();

    return await getAccountEntities(this.conn, { systemAccountId, ...params });
  }

  async getEntities(
    params: Parameters<DbClient["getEntities"]>[0],
  ): ReturnType<DbClient["getEntities"]> {
    return await getEntities(this.conn, params);
  }

  async getAccountEntityTypes(
    params: Parameters<DbClient["getAccountEntityTypes"]>[0],
  ): ReturnType<DbClient["getAccountEntityTypes"]> {
    return await getAccountEntityTypes(this.conn, params);
  }

  async acquireEntityLock(
    params: Parameters<DbClient["acquireEntityLock"]>[0],
  ): ReturnType<DbClient["acquireEntityLock"]> {
    return acquireEntityLock(this.conn, params);
  }

  async getImpliedEntityHistory(
    params: Parameters<DbClient["getImpliedEntityHistory"]>[0],
  ): ReturnType<DbClient["getImpliedEntityHistory"]> {
    return getImpliedEntityHistory(this.conn, params);
  }

  async getAncestorReferences(
    params: Parameters<DbClient["getAncestorReferences"]>[0],
  ): ReturnType<DbClient["getAncestorReferences"]> {
    return getAncestorReferences(this.conn, params);
  }

  async getSystemAccountId(): ReturnType<DbClient["getSystemAccountId"]> {
    return getSystemAccountId(this.conn);
  }

  async getChildren(
    params: Parameters<DbClient["getChildren"]>[0],
  ): ReturnType<DbClient["getChildren"]> {
    return getChildren(this.conn, params);
  }
}
