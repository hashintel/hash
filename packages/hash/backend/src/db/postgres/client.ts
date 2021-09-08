import { sql } from "slonik";

import {
  DBClient,
  Entity,
  EntityMeta,
  EntityType,
  EntityVersion,
  VerificationCode,
} from "../adapter";
import { gatherLinks, replaceLink, entityNotFoundError } from "./util";
import { genId } from "../../util";
import { Connection } from "./types";
import {
  getEntityAccountIdMany,
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
  getAccountEntities,
  getEntities,
  getEntitiesByTypeAllVersions,
  getEntitiesByTypeLatestVersion,
  getEntity,
  getEntityHistory,
  getEntityLatestVersion,
  getEntityLatestVersionId,
  insertEntityVersion,
  updateEntityVersionProperties,
} from "./entity";
import {
  getEntityParentIds,
  insertIncomingLinks,
  insertOutgoingLinks,
} from "./link";
import { getUserByEmail, getUserByShortname } from "./user";
import {
  insertVerificationCode,
  getVerificationCode,
  incrementVerificationCodeAttempts,
  pruneVerificationCodes,
  setVerificationCodeToUsed,
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

  private async createLinks(conn: Connection, entity: Entity): Promise<void> {
    const linkedEntityIdsSet = new Set(gatherLinks(entity));
    const linkedEntityIds = Array.from(linkedEntityIdsSet);
    const accIdMap = await getEntityAccountIdMany(conn, linkedEntityIdsSet);

    const missing = linkedEntityIds.filter((id) => !accIdMap.has(id));
    if (missing.length !== 0) {
      throw new Error(
        `entity ${entity.entityVersionId} references missing entities ${missing}`
      );
    }

    await Promise.all([
      insertOutgoingLinks(
        conn,
        linkedEntityIds.map((id) => ({
          accountId: entity.accountId,
          entityVersionId: entity.entityVersionId,
          childAccountId: accIdMap.get(id)!,
          childVersionId: id,
        }))
      ),

      insertIncomingLinks(
        conn,
        linkedEntityIds.map((id) => ({
          accountId: accIdMap.get(id)!,
          entityVersionId: id,
          parentAccountId: entity.accountId,
          parentVersionId: entity.entityVersionId,
        }))
      ),
    ]);
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
          name,
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

      if (!entityTypeId && !entityTypeVersionId && !systemTypeName) {
        throw new Error(
          "You must provide one of entityTypeId, entityTypeVersionId, or systemTypeName."
        );
      }

      const entityType = systemTypeName
        ? await getSystemTypeLatestVersion(conn, { systemTypeName })
        : entityTypeVersionId
        ? await getEntityType(conn, { entityVersionId: entityTypeVersionId })
        : await getEntityTypeLatestVersion(conn, { entityId: entityTypeId! });

      if (!entityType) {
        throw new Error(
          `Entity type not found with ` +
            (entityTypeVersionId
              ? `entityTypeVersionId ${entityTypeVersionId}.`
              : `entityTypeId ${entityTypeId}.`)
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
          outgoing_links_account_id_entity_version_id_fkey,
          outgoing_links_child_account_id_child_version_id_fkey,
          incoming_links_account_id_entity_version_id_fkey,
          incoming_links_parent_account_id_parent_version_id_fkey
        deferred
      `);

      await Promise.all([
        this.createLinks(conn, entity),

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

  private async updateVersionedEntity(
    conn: Connection,
    params: {
      entity: Entity;
      newProperties: any;
    }
  ) {
    if (!params.entity.metadata.versioned) {
      throw new Error("cannot create new version of non-versioned entity"); // TODO: better error
    }

    const now = new Date();
    const newEntityVersion: Entity = {
      ...params.entity,
      entityVersionId: genId(),
      properties: params.newProperties,
      entityCreatedAt: now,
      entityVersionCreatedAt: now,
      entityVersionUpdatedAt: now,
    };

    // Defer FKs until end of transaction so we can insert concurrently
    await conn.query(sql`
      set constraints
        entity_account_account_id_entity_version_id_fkey,
        outgoing_links_account_id_entity_version_id_fkey,
        outgoing_links_child_account_id_child_version_id_fkey,
        incoming_links_account_id_entity_version_id_fkey,
        incoming_links_parent_account_id_parent_version_id_fkey
      deferred
    `);

    await Promise.all([
      insertEntityVersion(conn, newEntityVersion),

      this.createLinks(conn, newEntityVersion),

      // Make a reference to this entity's account in the `entity_account` lookup table
      insertEntityAccount(this.conn, newEntityVersion),
    ]);

    return newEntityVersion;
  }

  private async updateNonVersionedEntity(
    conn: Connection,
    params: {
      entity: Entity;
      newProperties: any;
    }
  ): Promise<Entity> {
    if (params.entity.metadata.versioned) {
      throw new Error("cannot in-place update a versioned entity"); // TODO: better error
    }

    const updatedEntity: Entity = {
      ...params.entity,
      entityVersionUpdatedAt: new Date(),
      properties: params.newProperties,
    };

    await Promise.all([
      updateEntityVersionProperties(conn, updatedEntity),

      this.createLinks(conn, updatedEntity),
    ]);

    return updatedEntity;
  }

  async updateEntity(
    params: {
      accountId: string;
      entityVersionId: string;
      entityId: string;
      properties: any;
    },
    child?: { accountId: string; entityVersionId: string },
    checkLatest: boolean = true
  ): Promise<Entity[]> {
    const [entity, latestVersionId] = await Promise.all([
      getEntity(this.conn, params),
      getEntityLatestVersionId(this.conn, params),
    ]);

    if (!entity) {
      throw entityNotFoundError(params);
    }
    if (
      entity.metadata.versioned &&
      checkLatest &&
      entity.entityVersionId !== latestVersionId
    ) {
      // @todo: make this error catchable by the caller (conflicted input)
      throw new Error(
        `cannot update versioned entity ${entity.entityVersionId} because it does not match the latest version ${latestVersionId}`
      );
    }

    /**
     * @todo validate new entity properties against the schema of its entityType
     */
    if (entity.metadata.versioned) {
      const updatedEntity = await this.updateVersionedEntity(this.conn, {
        entity,
        newProperties: params.properties,
      });

      if (child) {
        await insertIncomingLinks(this.conn, [
          {
            ...child,
            parentAccountId: updatedEntity.accountId,
            parentVersionId: updatedEntity.entityVersionId,
          },
        ]);
      }
      // @todo: handle inserting into outgoing_links

      // Updating a versioned entity creates a new entity with a new ID. We need to
      // update all entities which reference this entity with this ID.
      // TODO: there's redundant _getEntity fetching here. Could refactor the function
      // signature to take the old state of the entity.
      const parentRefs = await getEntityParentIds(this.conn, { entity });
      const parents = await Promise.all(
        parentRefs.map(async (ref) => {
          const parent = await getEntity(this.conn, ref);
          if (!parent) {
            throw entityNotFoundError(ref);
          }
          return parent;
        })
      );
      const updatedParents = await Promise.all(
        parents.map(async (parent) => {
          replaceLink(parent, {
            old: entity.entityVersionId,
            new: updatedEntity.entityVersionId,
          });
          return await this.updateEntity(
            parent,
            {
              entityVersionId: updatedEntity.entityVersionId,
              accountId: updatedEntity.accountId,
            },
            false
          );
        })
      );

      return [updatedEntity].concat(updatedParents.flat());
    } else {
      const updatedEntity = await this.updateNonVersionedEntity(this.conn, {
        entity,
        newProperties: params.properties,
      });
      if (child) {
        await insertIncomingLinks(this.conn, [
          {
            ...child,
            parentAccountId: updatedEntity.accountId,
            parentVersionId: updatedEntity.entityVersionId,
          },
        ]);
        // @todo: handle inserting into outgoing_links
      }
      return [updatedEntity];
    }
  }

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
    latestOnly: boolean;
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
  async getAccountEntities(): Promise<Entity[]> {
    return await getAccountEntities(this.conn);
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

  // @todo: may be deprecated. Users of the adapter can now use a transction to combine
  // getEntity and updateEntity.
  async getAndUpdateEntity(params: {
    accountId: string;
    entityVersionId: string;
    handler: (entity: Entity) => Entity;
  }): Promise<Entity[]> {
    const entity = await this.getEntity(params, true);
    if (!entity) {
      throw entityNotFoundError(params);
    }
    const updated = params.handler(entity);
    return await this.updateEntity({
      accountId: params.accountId,
      entityVersionId: params.entityVersionId,
      entityId: entity.entityId,
      properties: updated.properties,
    });
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
      entityVersionId: string;
    }[]
  ): Promise<Entity[]> {
    return await getEntities(this.conn, entities);
  }

  async getEntityTypes(params: { accountId: string }): Promise<EntityType[]> {
    return await getAccountEntityTypes(this.conn, params);
  }
}
