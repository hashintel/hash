import { sql } from "slonik";

import {
  DBClient,
  Entity,
  EntityMeta,
  EntityType,
  EntityVersion,
  LoginCode,
} from "../adapter";
import { entityNotFoundError, gatherLinks, replaceLink } from "./util";
import { genId } from "../../util";
import { Connection } from "./types";
import {
  getEntityAccountIdMany,
  insertAccount,
  insertEntityAccount,
} from "./account";
import {
  getEntityType,
  getEntityTypeLatestVersion,
  getSystemTypeLatestVersion,
  insertEntityType,
  insertEntityTypeVersion,
  selectSystemEntityTypeIds,
  updateEntityType,
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
import { getUserByEmail, getUserById, getUserByShortname } from "./user";
import {
  getLoginCode,
  incrementLoginCodeAttempts,
  insertLoginCode,
  pruneLoginCodes,
} from "./login";
import { jsonSchema } from "../../lib/schemas/jsonSchema";
import { SystemType } from "../../types/entityTypes";
import { Visibility } from "../../graphql/apiTypes.gen";

export class PostgresClient implements DBClient {
  private conn: Connection;

  constructor(conn: Connection) {
    this.conn = conn;
  }

  private async createLinks(conn: Connection, entity: Entity): Promise<void> {
    const linkedEntityIdsSet = new Set(gatherLinks(entity));
    const linkedEntityIds = [...linkedEntityIdsSet];
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
    schema?: Record<string, any>;
  }): Promise<EntityType> {
    const { name, accountId, createdById, schema } = params;

    return this.conn.transaction(async (conn) => {
      // The fixed type id
      const entityTypeId = genId();

      // The id to assign this (first) version
      const entityTypeVersionId = genId();

      const now = new Date();
      const createdAt = now;
      const updatedAt = now;

      // create the fixed record for the type
      await insertEntityType(conn, {
        accountId,
        entityTypeId,
        name,
        createdById,
        createdAt,
        updatedAt,
      });

      // create the first version
      const properties = jsonSchema(name, accountId, schema);
      await insertEntityTypeVersion(conn, {
        accountId,
        entityTypeId,
        entityTypeVersionId,
        properties,
        createdById,
        createdAt,
        updatedAt,
      });

      const entityType: EntityType = {
        accountId,
        entityId: entityTypeId,
        entityVersionId: entityTypeVersionId,
        entityTypeName: "EntityType",
        id: entityTypeId,
        createdById,
        properties,
        metadata: {
          versioned: true,
        },
        metadataId: entityTypeId,
        createdAt,
        updatedAt,
        visibility: Visibility.Public,
      };

      return entityType;
    });
  }

  async createEntity(params: {
    accountId: string;
    createdById: string;
    entityVersionId?: string | null | undefined;
    entityTypeId?: string | null | undefined;
    entityTypeVersionId?: string | null | undefined;
    systemTypeName?: SystemType | null | undefined;
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
        ? await getEntityType(conn, { entityTypeVersionId })
        : await getEntityTypeLatestVersion(conn, {
            entityTypeId: entityTypeId!,
          });

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
      const entityId = genId();
      const entity: Entity = {
        accountId: params.accountId,
        createdById: params.createdById,
        entityId,
        entityVersionId,
        entityType,
        entityTypeId: entityType.entityId,
        entityTypeVersionId: entityType.entityVersionId,
        entityTypeName: entityType.properties.title,
        metadataId: entityId,
        properties: params.properties,
        id: entityId,
        metadata: {
          metadataId: entityId,
          versioned: params.versioned,
          extra: {}, // @todo: decide what to put in here
        },
        createdAt: now,
        updatedAt: now,
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
    metadataId: string;
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
      createdAt: now,
      updatedAt: now,
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
      updatedAt: new Date(),
      properties: params.newProperties,
    };

    const now = new Date();
    await Promise.all([
      updateEntityVersionProperties(conn, updatedEntity),

      this.createLinks(conn, updatedEntity),
    ]);

    return {
      ...params.entity,
      properties: params.newProperties,
      updatedAt: now,
    };
  }

  async updateEntity(
    params: {
      accountId: string;
      entityVersionId: string;
      metadataId: string;
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
   * @param params.entityTypeId the fixed id of the entityType
   * @param params.entityTypeVersionId optionally provide the version the update is based on.
   *   the function will throw an error if this does not match the latest in the database.
   * @param params.name update the entity type's name (must be unique in the account)
   * @param params.schema update the entity type's schema
   */
  async updateEntityType(params: {
    createdById: string;
    entityTypeId: string;
    entityTypeVersionId?: string;
    newName?: string;
    newSchema?: Record<string, any>;
  }): Promise<EntityType> {
    const { entityTypeId, entityTypeVersionId, newName, newSchema } = params;
    if (!newName && !newSchema) {
      throw new Error(
        "At least one of params.name or params.schema must be provided."
      );
    }

    const latestEntityType = await getEntityTypeLatestVersion(this.conn, {
      entityTypeId,
    });
    if (!latestEntityType) {
      throw new Error(`Could not find entityType with id ${entityTypeId}`);
    }

    if (
      entityTypeVersionId &&
      entityTypeVersionId !== latestEntityType.entityTypeVersionId
    ) {
      throw new Error(
        `Provided entityTypeVersionId ${entityTypeVersionId} does not match latest: ${entityTypeVersionId}`
      );
    }

    const baseSchema = newSchema ?? latestEntityType.properties;
    const nameToSet = newName ?? baseSchema.title;

    const schemaToSet = jsonSchema(
      nameToSet,
      latestEntityType.accountId,
      baseSchema
    );

    const now = new Date();
    const newVersionId = genId();

    await updateEntityType(this.conn, {
      accountId: latestEntityType.accountId,
      entityTypeId,
      entityTypeVersionId: newVersionId,
      name: nameToSet,
      properties: schemaToSet,
      createdById: params.createdById,
      createdAt: now,
      updatedAt: now,
    });

    return {
      ...latestEntityType,
      entityTypeName: "EntityType",
      properties: newSchema,
      updatedAt: now,
    };
  }

  async getUserById(params: { id: string }) {
    return await getUserById(this.conn, params);
  }

  async getUserByEmail(params: { email: string }) {
    return await getUserByEmail(this.conn, params);
  }

  async getUserByShortname(params: { shortname: string }) {
    return await getUserByShortname(this.conn, params);
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
    metadataId: string;
    extra: any;
  }): Promise<EntityMeta> {
    return await updateEntityMetadata(this.conn, params);
  }

  async createLoginCode(params: {
    accountId: string;
    userId: string;
    code: string;
  }): Promise<LoginCode> {
    const id = genId();
    const createdAt = new Date();
    await insertLoginCode(this.conn, { ...params, loginId: id, createdAt });
    return { id, ...params, createdAt, numberOfAttempts: 0 };
  }

  async getLoginCode(params: { loginId: string }): Promise<LoginCode | null> {
    return await getLoginCode(this.conn, params);
  }

  async incrementLoginCodeAttempts(params: {
    loginCode: LoginCode;
  }): Promise<void> {
    return await incrementLoginCodeAttempts(this.conn, params);
  }

  async pruneLoginCodes(): Promise<number> {
    return await pruneLoginCodes(this.conn);
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
      metadataId: entity.metadataId,
      properties: updated.properties,
    });
  }

  async getEntityHistory(params: {
    accountId: string;
    metadataId: string;
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
}
