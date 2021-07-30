import {
  DBClient,
  Entity,
  EntityMeta,
  LoginCode,
  EntityVersion,
} from "../adapter";
import { gatherLinks, replaceLink, entityNotFoundError } from "./util";
import { genId } from "../../util";
import { Connection } from "./types";
import {
  insertAccount,
  insertEntityAccount,
  getEntityAccountIdMany,
} from "./account";
import { getEntityTypeId, createEntityType } from "./entitytypes";
import { insertEntityMetadata, updateEntityMetadata } from "./metadata";
import {
  insertEntity,
  getEntity,
  getLatestEntityVersion,
  updateEntityProperties,
  getEntitiesByTypeAllVersions,
  getEntitiesByTypeLatest,
  getAccountEntities,
  getEntityHistory,
  getEntities,
} from "./entity";
import {
  getEntityParentIds,
  insertIncomingLinks,
  insertOutgoingLinks,
} from "./link";
import { getUserById, getUserByEmail, getUserByShortname } from "./user";
import {
  insertLoginCode,
  getLoginCode,
  incrementLoginCodeAttempts,
  pruneLoginCodes,
} from "./login";

import { sql } from "slonik";

export class PostgresClient implements DBClient {
  private conn: Connection;

  constructor(conn: Connection) {
    this.conn = conn;
  }

  async createEntity(params: {
    accountId: string;
    entityId?: string;
    createdById: string;
    type: string;
    versioned: boolean;
    properties: any;
  }): Promise<Entity> {
    return await this.conn.transaction(async (conn) => {
      // Create the account if it does not already exist
      // TODO: this should be performed in a "createAccount" function, or similar.
      await insertAccount(conn, { accountId: params.accountId });

      // TODO: creating the entity type here if it doesn't exist. Do we want this?
      const entityTypeId =
        (await getEntityTypeId(conn, params.type)) ??
        (await createEntityType(conn, params.type));

      // @todo: if entityId is provided, check that it's a UUID
      const entityId = params.entityId ?? genId();
      const now = new Date();
      const metadataId = genId();
      const entity: Entity = {
        accountId: params.accountId,
        entityId: entityId,
        createdById: params.createdById,
        type: params.type,
        properties: params.properties,
        metadataId,
        metadata: {
          metadataId,
          versioned: params.versioned,
          extra: {}, // @todo: decide what to put in here
        },
        createdAt: now,
        updatedAt: now,
      };

      // Defer FKs until end of transaction so we can insert concurrently
      conn.query(sql`
        set constraints
          entities_account_id_metadata_id_fkey,
          entity_account_account_id_entity_id_fkey
        deferred
      `);

      const linkedEntityIdsSet = new Set(gatherLinks(entity));
      const linkedEntityIds = [...linkedEntityIdsSet];

      const [accIdMap, ..._] = await Promise.all([
        getEntityAccountIdMany(conn, linkedEntityIdsSet),

        insertEntityMetadata(conn, {
          accountId: entity.accountId,
          ...entity.metadata,
        }),

        insertEntity(conn, { ...entity, typeId: entityTypeId }),

        // Make a reference to this entity's account in the `entity_account` lookup table
        insertEntityAccount(conn, entity),
      ]);

      const missing = linkedEntityIds.filter((id) => !accIdMap.has(id));
      if (missing.length !== 0) {
        throw new Error(
          `entity ${entity.entityId} references missing entities ${missing}`
        );
      }

      await Promise.all([
        insertOutgoingLinks(
          conn,
          linkedEntityIds.map((id) => ({
            accountId: entity.accountId,
            entityId: entity.entityId,
            childAccountId: accIdMap.get(id)!,
            childId: id,
          }))
        ),

        insertIncomingLinks(
          conn,
          linkedEntityIds.map((id) => ({
            accountId: accIdMap.get(id)!,
            entityId: id,
            parentAccountId: entity.accountId,
            parentId: entity.entityId,
          }))
        ),
      ]);

      return entity;
    });
  }

  async getEntity(
    params: {
      accountId: string;
      entityId: string;
    },
    lock: boolean = false
  ): Promise<Entity | undefined> {
    return (await getEntity(this.conn, params, lock)) || undefined;
  }

  async getLatestEntityVersion(params: {
    accountId: string;
    metadataId: string;
  }): Promise<Entity | undefined> {
    return (await getLatestEntityVersion(this.conn, params)) || undefined;
  }

  private async updateVersionedEntity(params: {
    entity: Entity;
    newProperties: any;
  }) {
    if (!params.entity.metadata.versioned) {
      throw new Error("cannot create new version of non-versioned entity"); // TODO: better error
    }

    const typeId = await getEntityTypeId(this.conn, params.entity.type);
    if (!typeId) {
      throw new Error("type not found"); // TODO: better error
    }

    const now = new Date();
    const newEntityVersion: Entity = {
      ...params.entity,
      entityId: genId(),
      properties: params.newProperties,
      createdAt: now,
      updatedAt: now,
    };

    await insertEntity(this.conn, {
      ...newEntityVersion,
      typeId,
      metadataId: newEntityVersion.metadata.metadataId,
    });

    return newEntityVersion;
  }

  private async updateNonVersionedEntity(params: {
    entity: Entity;
    newProperties: any;
  }): Promise<Entity> {
    if (params.entity.metadata.versioned) {
      throw new Error("cannot in-place update a versioned entity"); // TODO: better error
    }

    const typeId = await getEntityTypeId(this.conn, params.entity.type);
    if (!typeId) {
      throw new Error("type not found"); // TODO: better error
    }

    const now = new Date();
    await updateEntityProperties(this.conn, {
      accountId: params.entity.accountId,
      entityId: params.entity.entityId,
      updatedAt: now,
      properties: params.newProperties,
    });

    return {
      ...params.entity,
      properties: params.newProperties,
      updatedAt: now,
    };
  }

  async updateEntity(params: {
    accountId: string;
    entityId: string;
    type?: string | undefined;
    properties: any;
    child?: { accountId: string; entityId: string };
  }): Promise<Entity[]> {
    const entity = await getEntity(this.conn, params);
    if (!entity) {
      throw entityNotFoundError(params);
    }

    if (params.type && params.type !== entity.type) {
      throw new Error("types don't match"); // TODO: better error
    }

    if (entity.metadata.versioned) {
      const updatedEntity = await this.updateVersionedEntity({
        entity,
        newProperties: params.properties,
      });

      if (params.child) {
        insertIncomingLinks(this.conn, [
          {
            ...params.child,
            parentAccountId: updatedEntity.accountId,
            parentId: updatedEntity.entityId,
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
            old: entity.entityId,
            new: updatedEntity.entityId,
          });
          return await this.updateEntity({
            ...parent,
            child: {
              entityId: updatedEntity.entityId,
              accountId: updatedEntity.accountId,
            },
          });
        })
      );

      return [updatedEntity].concat(updatedParents.flat());
    } else {
      const updatedEntity = await this.updateNonVersionedEntity({
        entity,
        newProperties: params.properties,
      });
      if (params.child) {
        insertIncomingLinks(this.conn, [
          {
            ...params.child,
            parentAccountId: updatedEntity.accountId,
            parentId: updatedEntity.entityId,
          },
        ]);
        // @todo: handle inserting into outgoing_links
      }
      return [updatedEntity];
    }
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

  async getEntitiesByType(params: {
    accountId: string;
    type: string;
    latestOnly: boolean;
  }): Promise<Entity[]> {
    return params.latestOnly
      ? await getEntitiesByTypeLatest(this.conn, params)
      : await getEntitiesByTypeAllVersions(this.conn, params);
  }

  /** Get all account entities. */
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
    entityId: string;
    handler: (entity: Entity) => Entity;
  }): Promise<Entity[]> {
    const entity = await this.getEntity(params, true);
    if (!entity) {
      throw entityNotFoundError(params);
    }
    const updated = params.handler(entity);
    return await this.updateEntity({
      accountId: params.accountId,
      entityId: params.entityId,
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
      entityId: string;
    }[]
  ): Promise<Entity[]> {
    return await getEntities(this.conn, entities);
  }
}
