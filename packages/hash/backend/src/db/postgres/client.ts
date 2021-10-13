import { sql } from "slonik";

import {
  DBClient,
  Entity,
  EntityMeta,
  EntityType,
  EntityVersion,
  VerificationCode,
} from "../adapter";
import { genId, exactlyOne } from "../../util";
import { Connection } from "./types";
import {
  getEntityAccountId,
  insertAccount,
  insertEntityAccount,
} from "./account";
import {
  getAccountEntityTypes,
  getEntityType,
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
  insertEntityVersion,
  acquireEntityLock,
  updateEntity,
} from "./entity";
import { insertLinks } from "./link";
import { getUserByEmail, getUserByShortname } from "./user";
import {
  insertVerificationCode,
  getVerificationCode,
  incrementVerificationCodeAttempts,
  pruneVerificationCodes,
  setVerificationCodeToUsed,
  getUserVerificationCodes,
} from "./verificationCode";
import { jsonSchema } from "../../lib/schemas/jsonSchema";
import { SystemType } from "../../types/entityTypes";
import { Visibility } from "../../graphql/apiTypes.gen";
import { getOrgByShortname } from "./org";

export class PostgresClient implements DBClient {
  private conn: Connection;

  constructor(conn: Connection) {
    this.conn = conn;
  }

  /** Create an entity type definition and return its uuid. */
  async createEntityType(params: {
    name: string;
    accountId: string;
    createdById: string;
    description?: string;
    schema?: Record<string, any>;
  }): Promise<EntityType> {
    const { name, accountId, createdById, description, schema } = params;

    return this.conn.transaction(async (conn) => {
      // The fixed type id
      const entityTypeId = genId();

      // The id to assign this (first) version
      const entityTypeVersionId = genId();

      const now = new Date();
      const properties = jsonSchema(name, accountId, schema, description);
      const entityType: EntityType = {
        accountId,
        entityId: entityTypeId,
        entityVersionId: entityTypeVersionId,
        entityTypeName: "EntityType",
        createdById,
        properties,
        metadata: {
          extra: {},
          versioned: true,
        },
        entityCreatedAt: now,
        entityVersionCreatedAt: now,
        entityVersionUpdatedAt: now,
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
  }): Promise<EntityType | undefined> {
    return getSystemTypeLatestVersion(this.conn, params);
  }

  /**
   * Create a new entity.
   * @throws: `DbInvalidLinksError` if the entity's properties contain a link to an
   *          entity which does not exist.
   */
  async createEntity(params: {
    accountId: string;
    createdById: string;
    entityId?: string;
    entityVersionId?: string;
    entityTypeId?: string;
    entityTypeVersionId?: string;
    systemTypeName?: SystemType;
    versioned: boolean;
    properties: any;
  }): Promise<Entity> {
    return await this.conn.transaction(async (conn) => {
      // Create the account if it does not already exist
      // TODO: this should be performed in a "createAccount" function, or similar.
      await insertAccount(conn, { accountId: params.accountId });

      const { entityTypeId, entityTypeVersionId, systemTypeName } = params;

      if (!exactlyOne(entityTypeId, entityTypeVersionId, systemTypeName)) {
        throw new Error(
          "Exactly one of entityTypeId, entityTypeVersionId or systemTypeName must be provided"
        );
      }

      const entityType = systemTypeName
        ? await getSystemTypeLatestVersion(conn, { systemTypeName })
        : entityTypeVersionId
        ? await getEntityType(conn, { entityVersionId: entityTypeVersionId })
        : await getEntityTypeLatestVersion(conn, { entityId: entityTypeId! });

      if (!entityType) {
        throw new Error(
          `Entity type not found with ${
            entityTypeVersionId
              ? `entityTypeVersionId ${entityTypeVersionId}.`
              : entityTypeId
              ? `entityTypeId ${entityTypeId}.`
              : `systemTypeName '${systemTypeName}'`
          }`
        );
      }

      // @todo: if versionId is provided, check that it's a UUID
      const entityVersionId = params.entityVersionId ?? genId();
      const now = new Date();
      const entityId = params.entityId ?? genId();
      const entity: Entity = {
        accountId: params.accountId,
        createdById: params.createdById,
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
        entityCreatedAt: now,
        entityVersionCreatedAt: now,
        entityVersionUpdatedAt: now,
        visibility: Visibility.Public,
      };

      // Defer FKs until end of transaction so we can insert concurrently
      await conn.query(sql`
        set constraints
          entity_versions_account_id_entity_id_fkey,
          entity_account_account_id_entity_version_id_fkey,
          outgoing_links_src_account_id_src_entity_id_fkey,
          outgoing_links_dst_account_id_dst_entity_id_fkey,
          incoming_links_dst_account_id_dst_entity_id_fkey,
          incoming_links_src_account_id_src_entity_id_fkey
        deferred
      `);

      await Promise.all([
        insertLinks(conn, entity),

        insertEntityMetadata(conn, {
          accountId: entity.accountId,
          entityId: entity.entityId,
          entityCreatedAt: entity.entityCreatedAt,
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
    lock: boolean = false
  ): Promise<Entity | undefined> {
    return (await getEntity(this.conn, params, lock)) || undefined;
  }

  async getEntityLatestVersion(params: {
    accountId: string;
    entityId: string;
  }): Promise<Entity | undefined> {
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

  /**
   * Update an entity, either versioned or non-versioned. Note: the update is always
   * applied to the latest version of the entity.
   * @param params.accountId the account ID the entity belongs to.
   * @param params.entityId the entity's fixed ID.
   * @param params.properties the entity's new properties.
   * @returns the entity's updated state.
   * @throws `DbEntityNotFoundError` if the entity does not exist.
   * @throws `DbInvalidLinksError` if the entity's new properties link to an entity which
   *          does not exist.
   */
  updateEntity = async (params: {
    accountId: string;
    entityId: string;
    properties: any;
  }): Promise<Entity> => updateEntity(this.conn, params);

  /**
   * Update an entity type, either its name, schema, or both.
   * Creates a new version of the entity type for any update.
   * @param params.entityId the fixed id of the entityType
   * @param params.entityVersionId optionally provide the version the update is based on.
   *   the function will throw an error if this does not match the latest in the database.
   * @param params.newName update the entity type's name (must be unique in the account)
   * @param params.newSchema update the entity type's schema
   */
  async updateEntityType(params: {
    createdById: string;
    entityId: string;
    entityVersionId?: string;
    newName?: string;
    newSchema?: Record<string, any>;
  }): Promise<EntityType> {
    const { entityId, entityVersionId, newName, newSchema } = params;
    if (!newName && !newSchema) {
      throw new Error(
        "At least one of params.name or params.schema must be provided."
      );
    }

    const entity = entityVersionId
      ? await getEntityType(this.conn, { entityVersionId })
      : await getEntityTypeLatestVersion(this.conn, params);

    if (!entity) {
      throw new Error(`Could not find entityType with id ${entityId}`);
    }
    if (entityVersionId && entityVersionId !== entity.entityVersionId) {
      throw new Error(
        `Provided entityVersionId ${entityVersionId} does not match latest: ${entity.entityVersionId}`
      );
    }

    const baseSchema = newSchema ?? entity.properties;
    const nameToSet = newName ?? baseSchema.title;

    const schemaToSet = jsonSchema(nameToSet, entity.accountId, baseSchema);

    const now = new Date();

    const newType: EntityType = {
      ...entity,
      entityVersionId: genId(),
      entityVersionCreatedAt: now,
      entityVersionUpdatedAt: now,
      createdById: params.createdById,
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
  }): Promise<Entity[]> {
    const { entity_type_id: entityTypeId } = await this.conn.one(
      selectSystemEntityTypeIds(params)
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
  }): Promise<Entity[]> {
    return params.latestOnly
      ? await getEntitiesByTypeLatestVersion(this.conn, params)
      : await getEntitiesByTypeAllVersions(this.conn, params);
  }

  /**  Get all account type entities (User or Org). */
  async getAllAccounts(): Promise<Entity[]> {
    return await getAllAccounts(this.conn);
  }

  async updateEntityMetadata(params: {
    accountId: string;
    entityId: string;
    extra: any;
  }): Promise<EntityMeta> {
    return await updateEntityMetadata(this.conn, params);
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
  }): Promise<EntityVersion[]> {
    return await getEntityHistory(this.conn, params);
  }

  async getEntities(
    entities: {
      accountId: string;
      entityId: string;
      entityVersionId?: string;
    }[]
  ): Promise<Entity[]> {
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
}
