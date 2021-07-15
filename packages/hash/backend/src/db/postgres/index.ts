import { Pool, PoolClient } from "pg";
import { DataSource } from "apollo-datasource";

import { DBAdapter, Entity, EntityMeta } from "../adapter";
import { genEntityId } from "../../util";
import { gatherLinks, entityNotFoundError, replaceLink } from "./util";

/** Get a required environment variable. Throws an error if it's not set. */
const getRequiredEnv = (name: string) => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
};

const parsePort = (str: string) => {
  if (/^\d+$/.test(str)) {
    return parseInt(str);
  }
  throw new Error("PG_PORT must be a positive number");
};

export class PostgresAdapter extends DataSource implements DBAdapter {
  private pool: Pool;

  constructor() {
    super();
    this.pool = new Pool({
      user: getRequiredEnv("HASH_PG_USER"),
      host: getRequiredEnv("HASH_PG_HOST"),
      port: parsePort(getRequiredEnv("HASH_PG_PORT")),
      database: getRequiredEnv("HASH_PG_DATABASE"),
      password: getRequiredEnv("HASH_PG_PASSWORD"),
    });
  }

  /** Execute a function inside a transaction. */
  private async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await fn(client);
      await client.query("COMMIT");
      return res;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /** Get the row ID of an entity type. */
  private async getEntityTypeId(
    client: PoolClient,
    name: string
  ): Promise<number | null> {
    const res = await client.query(
      "select id from entity_types where name = $1",
      [name]
    );
    return res.rowCount === 0 ? null : res.rows[0]["id"];
  }

  /** Create an entity type and return its row ID. */
  private async createEntityType(
    client: PoolClient,
    name: string
  ): Promise<number> {
    // The "on conflict do nothing" clause is required here because multiple transactions
    // may try to insert at the same time causing a conflict on the UNIQUE constraint on
    // entity_types name column.
    await client.query(
      "insert into entity_types (name) values ($1) on conflict do nothing",
      [name]
    );
    return (await this.getEntityTypeId(client, name))!;
  }

  private async createOutgoingLink(
    client: PoolClient,
    params: {
      namespaceId: string;
      entityId: string;
      childNamespaceId: string;
      childId: string;
    }
  ) {
    await client.query(
      `insert into outgoing_links (shard_id, entity_id, child_shard_id, child_id)
      values ($1, $2, $3, $4)`,
      [
        params.namespaceId,
        params.entityId,
        params.childNamespaceId,
        params.childId,
      ]
    );
  }

  private async createIncomingLink(
    client: PoolClient,
    params: {
      namespaceId: string;
      entityId: string;
      parentNamespaceId: string;
      parentId: string;
    }
  ) {
    await client.query(
      `insert into incoming_links (shard_id, entity_id, parent_shard_id, parent_id)
      values ($1, $2, $3, $4)`,
      [
        params.namespaceId,
        params.entityId,
        params.parentNamespaceId,
        params.parentId,
      ]
    );
  }

  private async getEntityNamespace(client: PoolClient, entityId: string) {
    const res = await client.query(
      "select shard_id from entity_shard where entity_id = $1",
      [entityId]
    );
    return res.rowCount === 0 ? null : (res.rows[0]["shard_id"] as string);
  }

  /** Insert a history entity corresponding to a new versioned entity. */
  private async insertHistoryEntity(
    client: PoolClient,
    params: {
      namespaceId: string;
      historyId: string;
      entityId: string;
      entityCreatedAt: Date;
    }
  ) {
    client.query(
      `insert into entity_history (shard_id, history_id, entity_id, created_at)
      values ($1, $2, $3, $4)`,
      [
        params.namespaceId,
        params.historyId,
        params.entityId,
        params.entityCreatedAt,
      ]
    );
  }

  /** Insert a row into the entities table. */
  private async insertEntity(
    client: PoolClient,
    params: {
      namespaceId: string;
      id: string;
      typeId: number;
      properties: any;
      historyId?: string;
      metadataId: string;
      createdById: string;
      createdAt: Date;
      updatedAt: Date;
    }
  ) {
    await client.query(
      `insert into entities (
          shard_id, id, type, properties, history_id, metadata_id, created_by,
          created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.namespaceId,
        params.id,
        params.typeId,
        params.properties,
        params.historyId,
        params.metadataId,
        params.createdById,
        params.createdAt,
        params.updatedAt,
      ]
    );
  }

  private async insertEntityMetadata(
    client: PoolClient,
    params: {
      namespaceId: string;
      metadataId: string;
      extra: any;
    }
  ): Promise<EntityMeta> {
    await client.query(
      "insert into entity_metadata (shard_id, metadata_id, extra) values ($1, $2, $3)",
      [params.namespaceId, params.metadataId, params.extra]
    );
    return { ...params } as EntityMeta;
  }

  /**
   * Create a new entity. If "id" is not provided it will be automatically generated. To
   * create a versioned entity, set the optional parameter "versioned" to `true`.
   * */
  async createEntity(params: {
    namespaceId: string;
    id?: string;
    createdById: string;
    type: string;
    versioned?: boolean;
    properties: any;
  }): Promise<Entity> {
    const id = params.id ?? genEntityId();
    const now = new Date();

    const entity = await this.tx(async (client) => {
      // Create the shard if it does not already exist
      // TODO: this should be performed in a "createNamespace" function, or similar.
      await client.query(
        `insert into shards (shard_id) values ($1)
        on conflict (shard_id) do nothing`,
        [params.namespaceId]
      );

      // TODO: creating the entity type here if it doesn't exist. Do we want this?
      const entityTypeId =
        (await this.getEntityTypeId(client, params.type)) ??
        (await this.createEntityType(client, params.type));

      const historyId = params.versioned ? genEntityId() : undefined;
      const metadataId = genEntityId();

      // TODO: defer FK and run concurrently with insertEntity
      const metadata = await this.insertEntityMetadata(client, {
        namespaceId: params.namespaceId,
        metadataId,
        extra: {}, // TODO: decide what to put in here
      });

      await this.insertEntity(client, {
        ...params,
        id,
        typeId: entityTypeId,
        historyId,
        metadataId,
        createdAt: now,
        updatedAt: now,
      });

      // If the entity is versioned, insert a corresponding history entity
      if (historyId) {
        await this.insertHistoryEntity(client, {
          namespaceId: params.namespaceId,
          historyId,
          entityId: id,
          entityCreatedAt: now,
        });
      }

      const entity: Entity = {
        namespaceId: params.namespaceId,
        id: id,
        createdById: params.createdById,
        type: params.type,
        properties: params.properties,
        history: historyId,
        metadata,
        createdAt: now,
        updatedAt: now,
      };

      // Make a reference to this entity's shard in the `entity_shard` lookup table
      // TODO: defer FK constraint and run concurrently with insertEntity
      await client.query(
        "insert into entity_shard (entity_id, shard_id) values ($1, $2)",
        [entity.id, entity.namespaceId]
      );

      // Gather the links this entity makes and insert incoming and outgoing references:
      const linkedEntityIds = gatherLinks(entity);
      await Promise.all(
        linkedEntityIds.map(async (dstId) => {
          const namespaceId = await this.getEntityNamespace(client, dstId);
          if (!namespaceId) {
            throw new Error(`namespace ID not found for entity ${dstId}`);
          }
          await Promise.all([
            this.createOutgoingLink(client, {
              namespaceId: entity.namespaceId,
              entityId: entity.id,
              childNamespaceId: namespaceId,
              childId: dstId,
            }),
            this.createIncomingLink(client, {
              namespaceId,
              entityId: dstId,
              parentNamespaceId: entity.namespaceId,
              parentId: entity.id,
            }),
          ]);
        })
      );

      return entity;
    });

    return entity;
  }

  private async _getEntity(
    client: PoolClient,
    params: { namespaceId: string; id: string }
  ): Promise<Entity | undefined> {
    console.log("_getEntity params = ", params);
    const res = await client.query(
      `select
        e.shard_id, e.id, t.name as type, e.properties, e.created_by, e.created_at,
        e.updated_at, e.history_id, e.metadata_id, meta.extra
      from
        entities as e
        join entity_types as t on e.type = t.id
        join entity_metadata as meta on
          e.shard_id = meta.shard_id and  -- required for sharding
          e.metadata_id = meta.metadata_id
      where
        e.shard_id = $1 and e.id = $2`,
      [params.namespaceId, params.id]
    );

    if (res.rowCount === 0) {
      return undefined;
    } else if (res.rowCount > 1) {
      throw new Error(`expected 1 row but received ${res.rowCount}`);
    }

    const row = res.rows[0];
    const entity: Entity = {
      namespaceId: row["shard_id"],
      id: row["id"],
      createdById: row["created_by"],
      type: row["type"],
      properties: row["properties"],
      history: row["history_id"],
      metadata: {
        metadataId: row["metadata_id"],
        extra: row["extra"],
      },
      createdAt: row["created_at"],
      updatedAt: row["updated_at"],
    };

    return entity;
  }

  /** Get an entity by ID in a given namespace. */
  async getEntity(params: {
    namespaceId: string;
    id: string;
  }): Promise<Entity | undefined> {
    const client = await this.pool.connect();
    try {
      return await this._getEntity(client, params);
    } finally {
      client.release();
    }
  }

  private async updateVersionedEntity(
    client: PoolClient,
    params: {
      entity: Entity;
      newProperties: any;
    }
  ) {
    if (!params.entity.history) {
      throw new Error("cannot create new version of non-versioned entity"); // TODO: better error
    }

    const typeId = await this.getEntityTypeId(client, params.entity.type);
    if (!typeId) {
      throw new Error("type not found"); // TODO: better error
    }

    const now = new Date();
    const newEntityVersion: Entity = {
      ...params.entity,
      id: genEntityId(),
      properties: params.newProperties,
      createdAt: now,
      updatedAt: now,
    };

    // TODO: if we defer the FK between entity_history and entities table, these two
    // queries may be performed concurrently.
    await this.insertEntity(client, {
      ...newEntityVersion,
      typeId,
      metadataId: newEntityVersion.metadata.metadataId,
    });
    await this.insertHistoryEntity(client, {
      namespaceId: newEntityVersion.namespaceId,
      historyId: newEntityVersion.history!,
      entityId: newEntityVersion.id,
      entityCreatedAt: newEntityVersion.createdAt,
    });

    return newEntityVersion;
  }

  private async updateNonVersionedEntity(
    client: PoolClient,
    params: {
      entity: Entity;
      newProperties: any;
    }
  ) {
    if (params.entity.history) {
      throw new Error("cannot in-place update a versioned entity"); // TODO: better error
    }

    const typeId = await this.getEntityTypeId(client, params.entity.type);
    if (!typeId) {
      throw new Error("type not found"); // TODO: better error
    }

    const now = new Date();
    const res = await client.query(
      `update entities set properties = $1, updated_at = $2
      where shard_id = $3 and id = $4`,
      [params.newProperties, now, params.entity.namespaceId, params.entity.id]
    );

    if (res.rowCount === 0) {
      throw new Error(`expected 1 row to be updated not ${res.rowCount}`);
    }
    return {
      ...params.entity,
      properties: params.newProperties,
      updatedAt: now,
    } as Entity;
  }

  /** Get the IDs of all entities which refrence a given entity. */
  private async getEntityParentIDs(client: PoolClient, entity: Entity) {
    const res = await client.query(
      `select parent_shard_id, parent_id from incoming_links
      where shard_id = $1 and entity_id = $2`,
      [entity.namespaceId, entity.id]
    );
    if (res.rowCount === 0) {
      return [];
    }
    return res.rows.map((row) => ({
      namespaceId: row["parent_shard_id"] as string,
      id: row["parent_id"] as string,
    }));
  }

  private async _updateEntity(
    client: PoolClient,
    params: {
      namespaceId: string;
      id: string;
      type?: string;
      properties: any;
    }
  ): Promise<Entity[]> {
    const entity = await this._getEntity(client, params);
    if (!entity) {
      throw entityNotFoundError({ ...params });
    }

    if (params.type && params.type !== entity.type) {
      throw new Error("types don't match"); // TODO: better error
    }

    if (entity.history) {
      const updatedEntity = await this.updateVersionedEntity(client, {
        entity,
        newProperties: params.properties,
      });

      // Updating a versioned entity creates a new entity with a new ID. We need to
      // update all entities which reference this entity with this ID.
      // TODO: there's redundant _getEntity fetching here. Could refactor the function
      // signature to take the old state of the entity.
      const parentRefs = await this.getEntityParentIDs(client, updatedEntity);
      const parents = await Promise.all(
        parentRefs.map(async (ref) => {
          const parent = await this._getEntity(client, ref);
          if (!parent) {
            throw entityNotFoundError(ref);
          }
          return parent;
        })
      );
      const updatedParents = await Promise.all(
        parents.map(async (parent) => {
          replaceLink(parent, { old: entity.id, new: updatedEntity.id });
          return await this._updateEntity(client, { ...parent });
        })
      );

      return [updatedEntity].concat(updatedParents.flat());
    }

    const updatedEntity = await this.updateNonVersionedEntity(client, {
      entity,
      newProperties: params.properties,
    });
    return [updatedEntity];
  }

  /** Update an entity's properties. If the "type" parameter is provided, the function
   * checks that it matches the entity's type. Returns `undefined` if the entity does
   * not exist in the given namespace.
   */
  async updateEntity(params: {
    namespaceId: string;
    id: string;
    type?: string;
    properties: any;
  }): Promise<Entity[]> {
    return await this.tx(async (client) => {
      return await this._updateEntity(client, params);
    });
  }

  /** Get all entities of a given type. */
  async getEntitiesByType(params: {
    namespaceId: string;
    type: string;
  }): Promise<Entity[]> {
    const res = await this.pool.query(
      `select
        e.shard_id, e.id, t.name as type, e.properties, e.created_by, e.created_at,
        e.updated_at, e.metadata_id, meta.extra
      from
        entities as e
        join entity_types as t on e.type = t.id
        join entity_metadata as meta on
          meta.shard_id = e.shard_id  -- required for sharding
          and meta.metadata_id = e.metadata_id
      where
        e.shard_id = $1 and t.name = $2`,
      [params.namespaceId, params.type]
    );

    return res.rows.map((row) => ({
      namespaceId: row["shard_id"],
      id: row["id"],
      createdById: row["created_by"],
      type: row["type"],
      properties: row["properties"],
      metadata: {
        metadataId: row["metadata_id"],
        extra: row["extra"],
      },
      createdAt: row["created_at"],
      updatedAt: row["updated_at"],
    }));
  }

  /** Get all namespace entities. */
  async getNamespaceEntities(): Promise<Entity[]> {
    const res = await this.pool.query(
      `select
        e.shard_id, e.id, t.name as type, e.properties, e.created_by, e.created_at,
        e.updated_at, e.metadata_id, meta.extra
      from
        entities as e
        join entity_types as t on e.type = t.id
        join entity_metadata as meta on
          meta.shard_id = e.shard_id  -- required for sharding
          and meta.metadata_id = e.metadata_id
      where
        e.shard_id = e.id`
    );
    return res.rows.map((row) => ({
      namespaceId: row["shard_id"],
      id: row["id"],
      createdById: row["created_by"],
      type: row["type"],
      properties: row["properties"],
      metadata: {
        metadataId: row["metadata_id"],
        extra: row["extra"],
      },
      createdAt: row["created_at"],
      updatedAt: row["updated_at"],
    }));
  }

  async updateEntityMetadata(params: {
    namespaceId: string;
    metadataId: string;
    extra: any;
  }): Promise<EntityMeta> {
    const res = await this.pool.query(
      `update entity_metadata set extra = $1 where shard_id = $2 and metadata_id = $3`,
      [params.extra, params.namespaceId, params.metadataId]
    );
    if (res.rowCount !== 1) {
      throw new Error("internal error"); // TODO: better erorr message
    }
    return { ...params };
  }
}
