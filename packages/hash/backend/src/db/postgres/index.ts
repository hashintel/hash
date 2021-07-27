import { DataSource } from "apollo-datasource";
import { StatsD } from "hot-shots";
import { createPool, DatabasePoolType } from "slonik";
import { DbUser } from "src/types/dbTypes";

import { PostgresClient } from "./client";
import { getRequiredEnv } from "../../util";
import {
  DBAdapter,
  Entity,
  EntityMeta,
  LoginCode,
  EntityVersion,
} from "../adapter";

export const createConnPool = () => {
  const user = getRequiredEnv("HASH_PG_USER");
  const host = getRequiredEnv("HASH_PG_HOST");
  const port = getRequiredEnv("HASH_PG_PORT");
  const database = getRequiredEnv("HASH_PG_DATABASE");
  const password = getRequiredEnv("HASH_PG_PASSWORD");
  const connStr = `postgresql://${user}:${password}@${host}:${port}/${database}`;
  return createPool(connStr);
};

export class PostgresAdapter extends DataSource implements DBAdapter {
  private statsdInterval: NodeJS.Timeout;
  private pool: DatabasePoolType;

  constructor(statsd?: StatsD) {
    super();
    this.pool = createConnPool();
    this.statsdInterval = setInterval(() => {
      const state = this.pool.getPoolState();
      statsd?.gauge("pool_waiting_count", state.waitingClientCount);
      statsd?.gauge("pool_idle_count", state.idleConnectionCount);
    }, 5000);
  }

  /** Close all connections to the database. This function is idempotent.*/
  async close() {
    if (this.pool.getPoolState().ended) {
      return;
    }
    clearInterval(this.statsdInterval);
    return await this.pool.end();
  }

  private async query<T>(fn: (adapter: DBAdapter) => Promise<T>): Promise<T> {
    return await this.pool.connect(async (client) => {
      const adapter = new PostgresClient(client);
      return await fn(adapter);
    });
  }

  /** Initiate a new database transaction. All `DBAdapter` methods called within
   * the provided callback `fn` are executed within the same transaction.
   * */
  async transaction<T>(
    fn: (adapter: PostgresClient) => Promise<T>
  ): Promise<T> {
    return await this.pool.connect(async (client) => {
      return await client.transaction(async (tx) => {
        const adapter = new PostgresClient(tx);
        return await fn(adapter);
      });
    });
  }

  createEntity(params: {
    accountId: string;
    entityId?: string | undefined;
    createdById: string;
    type: string;
    versioned?: boolean | undefined;
    properties: any;
  }): Promise<Entity> {
    return this.query((adapter) => adapter.createEntity(params));
  }

  getEntity(params: {
    accountId: string;
    entityId: string;
  }): Promise<Entity | undefined> {
    return this.query((adapter) => adapter.getEntity(params));
  }

  getLatestEntityVersion(params: {
    accountId: string;
    metadataId: string;
  }): Promise<Entity | undefined> {
    return this.query((adapter) => adapter.getLatestEntityVersion(params));
  }

  updateEntity(params: {
    accountId: string;
    entityId: string;
    type?: string | undefined;
    properties: any;
  }): Promise<Entity[]> {
    return this.query((adapter) => adapter.updateEntity(params));
  }

  getUserById(params: { id: string }): Promise<DbUser | null> {
    return this.query((adapter) => adapter.getUserById(params));
  }

  getUserByEmail(params: { email: string }): Promise<DbUser | null> {
    return this.query((adapter) => adapter.getUserByEmail(params));
  }

  getUserByShortname(params: { shortname: string }): Promise<DbUser | null> {
    return this.query((adapter) => adapter.getUserByShortname(params));
  }

  getEntitiesByType(params: {
    accountId: string;
    type: string;
    latestOnly: boolean;
  }): Promise<Entity[]> {
    return this.query((adapter) => adapter.getEntitiesByType(params));
  }

  getAccountEntities(): Promise<Entity[]> {
    return this.query((adapter) => adapter.getAccountEntities());
  }

  updateEntityMetadata(params: {
    accountId: string;
    metadataId: string;
    extra: any;
  }): Promise<EntityMeta> {
    return this.query((adapter) => adapter.updateEntityMetadata(params));
  }

  createLoginCode(params: {
    accountId: string;
    userId: string;
    code: string;
  }): Promise<LoginCode> {
    return this.query((adapter) => adapter.createLoginCode(params));
  }

  getLoginCode(params: { loginId: string }): Promise<LoginCode | null> {
    return this.query((adapter) => adapter.getLoginCode(params));
  }

  incrementLoginCodeAttempts(params: { loginCode: LoginCode }): Promise<void> {
    return this.query((adapter) => adapter.incrementLoginCodeAttempts(params));
  }

  pruneLoginCodes(): Promise<number> {
    return this.query((adapter) => adapter.pruneLoginCodes());
  }

  getAndUpdateEntity(params: {
    accountId: string;
    entityId: string;
    handler: (entity: Entity) => Entity;
  }): Promise<Entity[]> {
    return this.query((adapter) => adapter.getAndUpdateEntity(params));
  }

  getEntityHistory(params: {
    accountId: string;
    historyId: string;
  }): Promise<EntityVersion[] | undefined> {
    return this.query((adapter) => adapter.getEntityHistory(params));
  }
}
