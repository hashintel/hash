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
  getEntityAccount,
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
} from "./entity";
import {
  insertIncomingLink,
  insertOutgoingLink,
  getEntityParentIds,
} from "./link";
import { getUserById, getUserByEmail, getUserByShortname } from "./user";
import {
  insertLoginCode,
  getLoginCode,
  incrementLoginCodeAttempts,
  pruneLoginCodes,
} from "./login";

export class PostgresClient implements DBClient {
  private conn: Connection;

  constructor(conn: Connection) {
    this.conn = conn;
  }

  async createEntity(params: {
    accountId: string;
    entityId?: string | undefined;
    createdById: string;
    type: string;
    versioned?: boolean | undefined;
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

      const entityId = params.entityId ?? genId();
      const now = new Date();
      const historyId = params.versioned ? genId() : undefined;
      const metadataId = genId();

      // TODO: defer FK and run concurrently with insertEntity
      const metadata = await insertEntityMetadata(conn, {
        accountId: params.accountId,
        metadataId,
        extra: {}, // TODO: decide what to put in here
      });

      await insertEntity(conn, {
        ...params,
        entityId: entityId,
        typeId: entityTypeId,
        historyId,
        metadataId,
        createdAt: now,
        updatedAt: now,
      });

      const entity: Entity = {
        accountId: params.accountId,
        entityId: entityId,
        createdById: params.createdById,
        type: params.type,
        properties: params.properties,
        historyId,
        metadataId,
        metadata,
        createdAt: now,
        updatedAt: now,
      };

      // Make a reference to this entity's account in the `entity_account` lookup table
      // TODO: defer FK constraint and run concurrently with insertEntity
      await insertEntityAccount(conn, entity);

      // Gather the links this entity makes and insert incoming and outgoing references:
      // TODO: could combine inserts below into fewer queries.
      const linkedEntityIds = gatherLinks(entity);
      await Promise.all(
        linkedEntityIds.map(async (dstId) => {
          const accountId = await getEntityAccount(conn, dstId);
          if (!accountId) {
            throw new Error(`accountId not found for entity ${dstId}`);
          }
          await Promise.all([
            insertOutgoingLink(conn, {
              accountId: entity.accountId,
              entityId: entity.entityId,
              childAccountId: accountId,
              childId: dstId,
            }),
            insertIncomingLink(conn, {
              accountId,
              entityId: dstId,
              parentAccountId: entity.accountId,
              parentId: entity.entityId,
            }),
          ]);
        })
      );

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
    if (!params.entity.historyId) {
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

    // TODO: if we defer the FK between entity_history and entities table, these two
    // queries may be performed concurrently.
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
    if (params.entity.historyId) {
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
  }): Promise<Entity[]> {
    const entity = await getEntity(this.conn, params);
    if (!entity) {
      throw entityNotFoundError(params);
    }

    if (params.type && params.type !== entity.type) {
      throw new Error("types don't match"); // TODO: better error
    }

    if (entity.historyId) {
      const updatedEntity = await this.updateVersionedEntity({
        entity,
        newProperties: params.properties,
      });

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
          return await this.updateEntity(parent);
        })
      );

      return [updatedEntity].concat(updatedParents.flat());
    }

    const updatedEntity = await this.updateNonVersionedEntity({
      entity,
      newProperties: params.properties,
    });
    return [updatedEntity];
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
    historyId: string;
  }): Promise<EntityVersion[] | undefined> {
    return await getEntityHistory(this.conn, params);
  }
}
