import { Pool, PoolClient } from "pg";
import { DataSource } from "apollo-datasource";

import { DBAdapter, Entity, genEntityId } from "../adapter";

/** Get a required environment variable. Throws an error if it's not set. */
const getRequiredEnv = (name: string) => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
};

const parsePort = (s: string) => {
  if (/^\d+$/.test(s)) {
    return parseInt(s);
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
  private async tx<T>(f: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await f(client);
      await client.query("COMMIT");
      return res;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  private async q<T>(f: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await f(client);
    } finally {
      client.release();
    }
  }

  /** Get the row ID of an entity type. */
  private async getEntityTypeId(
    client: PoolClient,
    name: string
  ): Promise<number | null> {
    const q = "select id from entity_types where name = $1";
    const res = await client.query(q, [name]);
    return res.rowCount === 0 ? null : res.rows[0]["id"];
  }

  /** Create an entity type and return its row ID. */
  private async createEntityType(
    client: PoolClient,
    name: string
  ): Promise<number> {
    const q = "insert into entity_types (name) values ($1) returning id";
    const res = await client.query(q, [name]);
    return res.rows[0]["id"];
  }

  /** Create a new entity. */
  async createEntity(params: {
    namespaceId: string;
    id?: string;
    createdById: string;
    type: string;
    properties: any;
  }): Promise<Entity> {
    // TODO: create ID generation function
    const id = params.id ?? genEntityId();
    const now = new Date();

    await this.tx(async (client) => {
      // Create the shard if it does not already exist
      await client.query(
        `
        insert into shards (shard_id) values ($1) on conflict (shard_id) do nothing`,
        [params.namespaceId]
      );

      // TODO: creating the entity type here if it doesn't exist. Do we want this?
      const entityTypeId =
        (await this.getEntityTypeId(client, params.type)) ??
        (await this.createEntityType(client, params.type));

      await client.query(
        `
        insert into entities (
          shard_id, id, type, properties, created_by, created_at, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          params.namespaceId,
          id,
          entityTypeId,
          params.properties,
          params.createdById,
          now,
          now,
        ]
      );
    });

    return {
      namespaceId: params.namespaceId,
      id: id,
      createdById: params.createdById,
      type: params.type,
      properties: params.properties,
      createdAt: now,
      updatedAt: now,
    };
  }

  private async _getEntity(
    client: PoolClient,
    params: { namespaceId: string; id: string }
  ): Promise<Entity | undefined> {
    const q = `
      select
        e.shard_id, e.id, t.name as type, e.properties, e.created_by, e.created_at,
        e.updated_at
      from
        entities as e
        join entity_types as t on e.type = t.id
      where
        e.shard_id = $1 and e.id = $2
    `;
    const res = await client.query(q, [params.namespaceId, params.id]);

    if (res.rowCount === 0) {
      return undefined;
    } else if (res.rowCount > 1) {
      throw new Error(`expected 1 row but received ${res.rowCount}`);
    }

    const e = res.rows[0];
    const entity: Entity = {
      namespaceId: e["shard_id"],
      id: e["id"],
      createdById: e["created_by"],
      type: e["type"],
      properties: e["properties"],
      createdAt: e["created_at"],
      updatedAt: e["updated_at"],
    };

    return entity;
  }

  /** Get an entity by ID in a given namespace. */
  async getEntity(params: {
    namespaceId: string;
    id: string;
  }): Promise<Entity | undefined> {
    return await this.q((client) => this._getEntity(client, params));
  }

  /** Update an entity's properties. If the "type" parameter is provided, the function
   * checks that it matches the entity's type.
   */
  async updateEntity(params: {
    namespaceId: string;
    id: string;
    type?: string;
    properties: any;
  }): Promise<Entity | undefined> {
    const namespaceId = params.namespaceId;
    const id = params.id;

    return await this.tx(async (client) => {
      let typeId;
      if (params.type) {
        typeId = await this.getEntityTypeId(client, params.type);
        if (!typeId) {
          // TODO: should be an error that the caller can catch
          throw new Error(`entity type "${params.type}" does not exist`);
        }
      }

      let q = `
        update entities set
          properties = $1,
          updated_at = now()
        where
          shard_id = $2 and id = $3`;
      let res;
      if (!typeId) {
        res = await client.query(q, [params.properties, namespaceId, id]);
      } else {
        q += ` and type = $4`;
        res = await client.query(q, [
          params.properties,
          namespaceId,
          id,
          typeId,
        ]);
      }

      if (res.rowCount === 0) {
        return undefined;
      } else if (res.rowCount > 1) {
        throw new Error(
          `expected 1 row to be updated but received ${res.rowCount}`
        );
      }

      return await this._getEntity(client, { namespaceId, id });
    });
  }

  async getEntitiesByType(params: {
    namespaceId: string;
    type: string;
  }): Promise<Entity[]> {
    const q = `
      select
        e.shard_id, e.id, t.name as type, e.properties, e.created_by, e.created_at,
        e.updated_at
      from
        entities as e
        join entity_types as t on e.type = t.id
      where
        e.shard_id = $1 and t.name = $2
    `;
    const res = await this.pool.query(q, [params.namespaceId, params.type]);

    return res.rows.map((r) => ({
      namespaceId: r["shard_id"],
      id: r["id"],
      createdById: r["created_by"],
      type: r["type"],
      properties: r["properties"],
      createdAt: r["created_at"],
      updatedAt: r["updated_at"],
    }));
  }

  async getNamespaceEntities(): Promise<Entity[]> {
    const res = await this.pool.query(`
      select
        e.shard_id, e.id, t.name as type, e.properties, e.created_by, e.created_at,
        e.updated_at
      from
        entities as e
        join entity_types as t on e.type = t.id
      where
        e.shard_id = e.id`);
    return res.rows.map((r) => ({
      namespaceId: r["shard_id"],
      id: r["id"],
      createdById: r["created_by"],
      type: r["type"],
      properties: r["properties"],
      createdAt: r["created_at"],
      updatedAt: r["updated_at"],
    }));
  }

  // Execute a query. This is exposed only temporarily. The actual database adapter will
  // export product-specific functions behind an interface (e.g. createUser ...)
  query = (text: string, params?: any) => {
    return this.pool.query(text, params);
  };
}
