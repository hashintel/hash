import { Pool, PoolClient } from "pg";
import { DataSource } from "apollo-datasource";
import { StatsD } from "hot-shots";

import { DBAdapter, Entity, EntityMeta, EntityVersion } from "../adapter";
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
  private statsdInterval: NodeJS.Timeout;

  constructor(statsd?: StatsD) {
    super();
    this.pool = new Pool({
      user: getRequiredEnv("HASH_PG_USER"),
      host: getRequiredEnv("HASH_PG_HOST"),
      port: parsePort(getRequiredEnv("HASH_PG_PORT")),
      database: getRequiredEnv("HASH_PG_DATABASE"),
      password: getRequiredEnv("HASH_PG_PASSWORD"),
    });

    this.statsdInterval = setInterval(() => {
      statsd?.gauge("pool_waiting_count", this.pool.waitingCount);
      statsd?.gauge("pool_idle_count", this.pool.idleCount);
    }, 5000);
  }

  /** Close all connections to the database. */
  close() {
    clearInterval(this.statsdInterval);
    return this.pool.end();
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
      accountId: string;
      entityId: string;
      childAccountId: string;
      childId: string;
    }
  ) {
    await client.query(
      `insert into outgoing_links (account_id, entity_id, child_account_id, child_id)
      values ($1, $2, $3, $4)`,
      [params.accountId, params.entityId, params.childAccountId, params.childId]
    );
  }

  private async createIncomingLink(
    client: PoolClient,
    params: {
      accountId: string;
      entityId: string;
      parentAccountId: string;
      parentId: string;
    }
  ) {
    await client.query(
      `insert into incoming_links (account_id, entity_id, parent_account_id, parent_id)
      values ($1, $2, $3, $4)`,
      [
        params.accountId,
        params.entityId,
        params.parentAccountId,
        params.parentId,
      ]
    );
  }

  private async getEntityAccount(client: PoolClient, entityId: string) {
    const res = await client.query(
      "select account_id from entity_account where entity_id = $1",
      [entityId]
    );
    return res.rowCount === 0 ? null : (res.rows[0]["account_id"] as string);
  }

  /** Insert a row into the entities table. */
  private async insertEntity(
    client: PoolClient,
    params: {
      accountId: string;
      entityId: string;
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
          account_id, entity_id, type, properties, history_id, metadata_id, created_by,
          created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.accountId,
        params.entityId,
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
      accountId: string;
      metadataId: string;
      extra: any;
    }
  ): Promise<EntityMeta> {
    await client.query(
      "insert into entity_metadata (account_id, metadata_id, extra) values ($1, $2, $3)",
      [params.accountId, params.metadataId, params.extra]
    );
    return params as EntityMeta;
  }

  /**
   * Create a new entity. If entityId is not provided it will be automatically generated.
   * To create a versioned entity, set the optional parameter "versioned" to `true`.
   * */
  async createEntity(params: {
    accountId: string;
    entityId?: string;
    createdById: string;
    type: string;
    versioned?: boolean;
    properties: any;
  }): Promise<Entity> {
    const entityId = params.entityId ?? genEntityId();
    const now = new Date();

    const entity = await this.tx(async (client) => {
      // Create the shard if it does not already exist
      // TODO: this should be performed in a "createAccount" function, or similar.
      await client.query(
        `insert into accounts (account_id) values ($1)
        on conflict (account_id) do nothing`,
        [params.accountId]
      );

      // TODO: creating the entity type here if it doesn't exist. Do we want this?
      const entityTypeId =
        (await this.getEntityTypeId(client, params.type)) ??
        (await this.createEntityType(client, params.type));

      const historyId = params.versioned ? genEntityId() : undefined;
      const metadataId = genEntityId();

      // TODO: defer FK and run concurrently with insertEntity
      const metadata = await this.insertEntityMetadata(client, {
        accountId: params.accountId,
        metadataId,
        extra: {}, // TODO: decide what to put in here
      });

      await this.insertEntity(client, {
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

      // Make a reference to this entity's shard in the `entity_account` lookup table
      // TODO: defer FK constraint and run concurrently with insertEntity
      await client.query(
        "insert into entity_account (entity_id, account_id) values ($1, $2)",
        [entity.entityId, entity.accountId]
      );

      // Gather the links this entity makes and insert incoming and outgoing references:
      const linkedEntityIds = gatherLinks(entity);
      await Promise.all(
        linkedEntityIds.map(async (dstId) => {
          const accountId = await this.getEntityAccount(client, dstId);
          if (!accountId) {
            throw new Error(`accountId not found for entity ${dstId}`);
          }
          await Promise.all([
            this.createOutgoingLink(client, {
              accountId: entity.accountId,
              entityId: entity.entityId,
              childAccountId: accountId,
              childId: dstId,
            }),
            this.createIncomingLink(client, {
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

    return entity;
  }

  /** Get an entity. The optional argument `lock` may be set to `true` to lock
   *  the entity for selects or updates until the transaction completes.*/
  private async _getEntity(
    client: PoolClient,
    params: { accountId: string; entityId: string },
    lock: boolean = false
  ): Promise<Entity | undefined> {
    const res = await client.query(
      `select
        e.account_id, e.entity_id, t.name as type, e.properties, e.created_by,
        e.created_at, e.updated_at, e.history_id, e.metadata_id, meta.extra
      from
        entities as e
        join entity_types as t on e.type = t.id
        join entity_metadata as meta on
          e.account_id = meta.account_id and  -- required for sharding
          e.metadata_id = meta.metadata_id
      where
        e.account_id = $1 and e.entity_id = $2
      ${lock ? "for update" : ""}`,
      [params.accountId, params.entityId]
    );

    if (res.rowCount === 0) {
      return undefined;
    } else if (res.rowCount > 1) {
      throw new Error(`expected 1 row but received ${res.rowCount}`);
    }

    const row = res.rows[0];
    const entity: Entity = {
      accountId: row["account_id"],
      entityId: row["entity_id"],
      createdById: row["created_by"],
      type: row["type"],
      properties: row["properties"],
      historyId: row["history_id"],
      metadata: {
        metadataId: row["metadata_id"],
        extra: row["extra"],
      },
      metadataId: row["metadata_id"],
      createdAt: row["created_at"],
      updatedAt: row["updated_at"],
    };

    return entity;
  }

  async getLatestEntityVersion(params: {
    accountId: string;
    metadataId: string;
  }) {
    const res = await this.pool.query(
      `with all_matches as (
        select
          e.account_id, e.entity_id, t.name as type, e.properties, e.created_by,
          e.created_at, e.updated_at, e.history_id, e.metadata_id, meta.extra
        from
          entities as e
          join entity_types as t on e.type = t.id
          join entity_metadata as meta on
            e.account_id = meta.account_id and  -- required for sharding
            e.metadata_id = meta.metadata_id
        where
          e.account_id = $1 and e.metadata_id = $2
      )
      select distinct on (metadata_id)
        *
      from all_matches
      order by metadata_id, updated_at desc`,
      [params.accountId, params.metadataId]
    );

    if (res.rowCount === 0) {
      return undefined;
    } else if (res.rowCount > 1) {
      throw new Error(`expected 1 row but received ${res.rowCount}`);
    }

    const row = res.rows[0];
    const entity: Entity = {
      accountId: row["account_id"],
      entityId: row["entity_id"],
      createdById: row["created_by"],
      type: row["type"],
      properties: row["properties"],
      historyId: row["history_id"],
      metadata: {
        metadataId: row["metadata_id"],
        extra: row["extra"],
      },
      metadataId: row["metadata_id"],
      createdAt: row["created_at"],
      updatedAt: row["updated_at"],
    };

    return entity;
  }

  /** Get an entity by ID in a given account. */
  async getEntity(params: {
    accountId: string;
    entityId: string;
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
    if (!params.entity.historyId) {
      throw new Error("cannot create new version of non-versioned entity"); // TODO: better error
    }

    const typeId = await this.getEntityTypeId(client, params.entity.type);
    if (!typeId) {
      throw new Error("type not found"); // TODO: better error
    }

    const now = new Date();
    const newEntityVersion: Entity = {
      ...params.entity,
      entityId: genEntityId(),
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

    return newEntityVersion;
  }

  private async updateNonVersionedEntity(
    client: PoolClient,
    params: {
      entity: Entity;
      newProperties: any;
    }
  ) {
    if (params.entity.historyId) {
      throw new Error("cannot in-place update a versioned entity"); // TODO: better error
    }

    const typeId = await this.getEntityTypeId(client, params.entity.type);
    if (!typeId) {
      throw new Error("type not found"); // TODO: better error
    }

    const now = new Date();
    const res = await client.query(
      `update entities set properties = $1, updated_at = $2
      where account_id = $3 and entity_id = $4`,
      [
        params.newProperties,
        now,
        params.entity.accountId,
        params.entity.entityId,
      ]
    );

    if (res.rowCount !== 1) {
      throw new Error(`expected 1 row to be updated not ${res.rowCount}`);
    }
    return {
      ...params.entity,
      properties: params.newProperties,
      updatedAt: now,
    } as Entity;
  }

  /** Get the IDs of all entities which refrence a given entity. */
  private async getEntityParentIds(client: PoolClient, entity: Entity) {
    const res = await client.query(
      `select parent_account_id, parent_id from incoming_links
      where account_id = $1 and entity_id = $2`,
      [entity.accountId, entity.entityId]
    );
    if (res.rowCount === 0) {
      return [];
    }
    return res.rows.map((row) => ({
      accountId: row["parent_account_id"] as string,
      entityId: row["parent_id"] as string,
    }));
  }

  private async _updateEntity(
    client: PoolClient,
    params: {
      accountId: string;
      entityId: string;
      type?: string;
      properties: any;
    }
  ): Promise<Entity[]> {
    const entity = await this._getEntity(client, params);
    if (!entity) {
      throw entityNotFoundError(params);
    }

    if (params.type && params.type !== entity.type) {
      throw new Error("types don't match"); // TODO: better error
    }

    if (entity.historyId) {
      const updatedEntity = await this.updateVersionedEntity(client, {
        entity,
        newProperties: params.properties,
      });

      // Updating a versioned entity creates a new entity with a new ID. We need to
      // update all entities which reference this entity with this ID.
      // TODO: there's redundant _getEntity fetching here. Could refactor the function
      // signature to take the old state of the entity.
      const parentRefs = await this.getEntityParentIds(client, updatedEntity);
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
          replaceLink(parent, {
            old: entity.entityId,
            new: updatedEntity.entityId,
          });
          return await this._updateEntity(client, parent);
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
   * not exist in the given account.
   */
  async updateEntity(params: {
    accountId: string;
    entityId: string;
    type?: string;
    properties: any;
  }): Promise<Entity[]> {
    return await this.tx(async (client) => {
      return await this._updateEntity(client, params);
    });
  }

  /** Get all entities of a given type. */
  async getEntitiesByType(params: {
    accountId: string;
    type: string;
    latestOnly: boolean;
  }): Promise<Entity[]> {
    const allMatchesQ = `
      select
        e.account_id, e.entity_id, t.name as type, e.properties, e.created_by,
        e.created_at, e.updated_at, e.metadata_id, e.history_id, meta.extra,
        coalesce(e.history_id, e.entity_id) as grp_col
      from
        entities as e
        join entity_types as t on e.type = t.id
        join entity_metadata as meta on
          meta.account_id = e.account_id  -- required for sharding
          and meta.metadata_id = e.metadata_id
      where
        e.account_id = $1 and t.name = $2`;

    // Extracts the latest version of each entity from the allMatchesQ query.
    // Non-versioned entities have a null history_id, so we use the entity_id in this
    // case for the grouping column grp_col.
    const latestMatchesQ = `
      with all_matches as (${allMatchesQ})
      select distinct on (grp_col)
        *
      from
        all_matches
      order by grp_col, updated_at desc
    `;

    const res = await this.pool.query(
      params.latestOnly ? latestMatchesQ : allMatchesQ,
      [params.accountId, params.type]
    );

    return res.rows.map((row) => ({
      accountId: row["account_id"],
      entityId: row["entity_id"],
      createdById: row["created_by"],
      type: row["type"],
      properties: row["properties"],
      historyId: row["history_id"],
      metadata: {
        metadataId: row["metadata_id"],
        extra: row["extra"],
      },
      metadataId: row["metadata_id"],
      createdAt: row["created_at"],
      updatedAt: row["updated_at"],
    }));
  }

  /** Get all account entities. */
  async getAccountEntities(): Promise<Entity[]> {
    const res = await this.pool.query(
      `select
        e.account_id, e.entity_id, t.name as type, e.properties, e.created_by,
        e.created_at, e.updated_at, e.metadata_id, meta.extra
      from
        entities as e
        join entity_types as t on e.type = t.id
        join entity_metadata as meta on
          meta.account_id = e.account_id  -- required for sharding
          and meta.metadata_id = e.metadata_id
      where
        e.account_id = e.entity_id`
    );
    return res.rows.map((row) => ({
      accountId: row["account_id"],
      entityId: row["entity_id"],
      createdById: row["created_by"],
      type: row["type"],
      properties: row["properties"],
      historyId: row["history_id"],
      metadata: {
        metadataId: row["metadata_id"],
        extra: row["extra"],
      },
      metadataId: row["metadata_id"],
      createdAt: row["created_at"],
      updatedAt: row["updated_at"],
    }));
  }

  async updateEntityMetadata(params: {
    accountId: string;
    metadataId: string;
    extra: any;
  }): Promise<EntityMeta> {
    const res = await this.pool.query(
      `update entity_metadata set extra = $1 where account_id = $2 and metadata_id = $3`,
      [params.extra, params.accountId, params.metadataId]
    );
    if (res.rowCount !== 1) {
      throw new Error("internal error"); // TODO: better erorr message
    }
    return params;
  }

  async getAndUpdateEntity(params: {
    accountId: string;
    entityId: string;
    handler: (entity: Entity) => Entity;
  }): Promise<Entity[]> {
    const updated = await this.tx(async (client) => {
      const entity = await this._getEntity(client, params, true);
      if (!entity) {
        throw entityNotFoundError(params);
      }
      const updated = params.handler(entity);
      return await this._updateEntity(client, {
        accountId: params.accountId,
        entityId: params.entityId,
        properties: updated.properties,
      });
    });

    return updated;
  }

  async getEntityHistory(params: {
    accountId: string;
    historyId: string;
  }): Promise<EntityVersion[] | undefined> {
    const res = await this.pool.query(
      `select entity_id, created_by, created_at from entities
      where account_id = $1 and history_id = $2
      order by created_at
      `,
      [params.accountId, params.historyId]
    );
    if (res.rowCount === 0) {
      return undefined;
    }
    return res.rows.map((row) => ({
      entityId: row["entity_id"],
      createdAt: row["created_at"],
      createdById: row["createdById"],
    }));
  }
}
