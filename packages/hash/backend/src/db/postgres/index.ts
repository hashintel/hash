import { Pool, PoolClient } from "pg";
import { DataSource } from "apollo-datasource";
import { Uuid4 } from "id128";

import { DBAdapter } from "../adapter";

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

  private async tx<T>(f: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      return await f(client);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Create a new entity type. This operation is idempotent. Returns the row ID of the
   * type.
   * */
  private async getOrCreateEntityType(client: PoolClient, params: {name: string}) {
    const q = `
      insert into entity_types (name)
      values ($1)
      on conflict do nothing
      returning (id)
    `;
    const res = await client.query(q, [params.name]);
    return res.rows[0];
  };

  private async insertEntity(client: PoolClient, params: {}) {

  }


  async createEntity(params: {
    namespaceId: string;
    type: string;
    properties: any;
  }) {
    // TODO: the shard should be created somewhere else. Required for the FK
    await this.pool.query(`
      insert into shards (shard_id) values ($1)
      on conflict (shard_id) do nothing`,
      [params.namespaceId]
    );

    const id = Uuid4.generate().toCanonical();

    await this.tx(async (client) => {
      const entityType = await this.getOrCreateEntityType(client, {name: params.type});
      const q = `
        insert into entities (shard_id, id, type)
        values ($1, $2, $3)
      `;
      await client.query(q, [
        params.namespaceId,
        id,
        entityType,
        params.properties
      ]);


    });

  }

  // Execute a query. This is exposed only temporarily. The actual database adapter will
  // export product-specific functions behind an interface (e.g. createUser ...)
  query = (text: string, params?: any) => {
    return this.pool.query(text, params);
  };
}
