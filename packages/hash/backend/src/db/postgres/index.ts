import { DataSource } from "apollo-datasource";
import { StatsD } from "hot-shots";
import { createPool, DatabasePoolType } from "slonik";
import { Logger } from "winston";

import { DbUser } from "../../types/dbTypes";
import { PostgresClient } from "./client";
import { getRequiredEnv } from "../../util";
import {
  DBAdapter,
  DBClient,
  Entity,
  EntityMeta,
  EntityType,
  LoginCode,
  EntityVersion,
} from "../adapter";
import { SystemType } from "../../types/entityTypes";

export const createConnPool = (logger: Logger) => {
  const user = getRequiredEnv("HASH_PG_USER");
  const host = getRequiredEnv("HASH_PG_HOST");
  const port = getRequiredEnv("HASH_PG_PORT");
  const database = getRequiredEnv("HASH_PG_DATABASE");
  const password = getRequiredEnv("HASH_PG_PASSWORD");
  const connStr = `postgresql://${user}:${password}@${host}:${port}/${database}`;

  return createPool(connStr, {
    captureStackTrace: true,
    maximumPoolSize: 10, // @todo: needs tuning for production
    interceptors: [
      {
        queryExecutionError: (ctx, _query, error, _notices) => {
          logger.error({
            message: "sql_query_error",
            queryId: ctx.queryId,
            query: ctx.originalQuery.sql,
            errorMessage: `${error.name}: ${error.message}`,
            stackTrace: ctx.stackTrace,
          });
          return null;
        },
      },
    ],
  });
};

export class PostgresAdapter extends DataSource implements DBAdapter {
  private statsdInterval: NodeJS.Timeout;
  private pool: DatabasePoolType;

  constructor(logger: Logger, statsd?: StatsD) {
    super();
    this.pool = createConnPool(logger);
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

  private async query<T>(fn: (client: DBClient) => Promise<T>): Promise<T> {
    return await this.pool.connect(async (conn) => {
      const client = new PostgresClient(conn);
      return await fn(client);
    });
  }

  /** Initiate a new database transaction. All `DBAdapter` methods called within
   * the provided callback `fn` are executed within the same transaction.
   * */
  async transaction<T>(
    fn: (adapter: PostgresClient) => Promise<T>
  ): Promise<T> {
    return await this.pool.connect(async (conn) => {
      return await conn.transaction(async (tx) => {
        const client = new PostgresClient(tx);
        return await fn(client);
      });
    });
  }

  createEntityType(params: {
    accountId: string;
    createdById: string;
    name: string;
    schema?: Record<string, any>;
  }): Promise<EntityType> {
    return this.query((adapter) => adapter.createEntityType(params));
  }

  createEntity(params: {
    accountId: string;
    entityVersionId?: string | undefined | null;
    entityTypeId?: string | undefined | null;
    entityTypeVersionId?: string | undefined | null;
    systemTypeName?: SystemType | undefined | null;
    createdById: string;
    versioned: boolean;
    properties: any;
  }): Promise<Entity> {
    return this.query((adapter) => adapter.createEntity(params));
  }

  getEntity(params: {
    accountId: string;
    entityVersionId: string;
  }): Promise<Entity | undefined> {
    return this.query((adapter) => adapter.getEntity(params));
  }

  getLatestEntityVersion(params: {
    accountId: string;
    metadataId: string;
  }): Promise<Entity | undefined> {
    return this.query((adapter) => adapter.getLatestEntityVersion(params));
  }

  updateEntityType(params: {
    accountId: string;
    createdById: string;
    entityTypeId: string;
    name?: string;
    schema?: Record<string, any>;
  }): Promise<EntityType> {
    return this.query((adapter) => adapter.updateEntityType(params));
  }

  updateEntity(params: {
    accountId: string;
    entityVersionId: string;
    metadataId: string;
    properties: any;
  }): Promise<Entity[]> {
    return this.query((adapter) => adapter.updateEntity(params));
  }

  getUserById(params: { id: string }): Promise<Entity | null> {
    return this.query((adapter) => adapter.getUserById(params));
  }

  getUserByEmail(params: { email: string }): Promise<Entity | null> {
    return this.query((adapter) => adapter.getUserByEmail(params));
  }

  getUserByShortname(params: { shortname: string }): Promise<Entity | null> {
    return this.query((adapter) => adapter.getUserByShortname(params));
  }

  getEntitiesByType(params: {
    entityTypeId: string;
    entityTypeVersionId?: string;
    accountId: string;
    latestOnly: boolean;
  }): Promise<Entity[]> {
    return this.query((adapter) => adapter.getEntitiesByType(params));
  }

  getEntitiesBySystemType(params: {
    accountId: string;
    systemTypeName: SystemType;
    latestOnly: boolean;
  }): Promise<Entity[]> {
    return this.query((adapter) => adapter.getEntitiesBySystemType(params));
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
    entityVersionId: string;
    handler: (entity: Entity) => Entity;
  }): Promise<Entity[]> {
    return this.query((adapter) => adapter.getAndUpdateEntity(params));
  }

  getEntityHistory(params: {
    accountId: string;
    metadataId: string;
  }): Promise<EntityVersion[]> {
    return this.query((adapter) => adapter.getEntityHistory(params));
  }

  getEntities(
    entities: {
      accountId: string;
      entityVersionId: string;
    }[]
  ): Promise<Entity[]> {
    return this.query((adapter) => adapter.getEntities(entities));
  }
}
