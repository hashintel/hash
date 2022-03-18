import { DataSource } from "apollo-datasource";
import { StatsD } from "hot-shots";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import {
  createPostgresConnPool,
  PgPool,
} from "@hashintel/hash-backend-utils/postgres";

import { PostgresClient } from "./client";
import {
  DbAdapter,
  DbAggregation,
  DbClient,
  DbLink,
  DbEntity,
  EntityMeta,
  EntityType,
  EntityVersion,
  VerificationCode,
} from "../adapter";
import { createPoolConnection, createTransactionConnection } from "./types";

export type Config = {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
  maxPoolSize: number;
};

export class PostgresAdapter extends DataSource implements DbAdapter {
  private statsdInterval: NodeJS.Timeout;
  private pool: PgPool;

  constructor(cfg: Config, logger: Logger, statsd?: StatsD) {
    super();
    this.pool = createPostgresConnPool(logger, cfg);
    this.statsdInterval = setInterval(() => {
      const state = this.pool.getPoolState();
      statsd?.gauge("pool_waiting_count", state.waitingClientCount);
      statsd?.gauge("pool_idle_count", state.idleConnectionCount);
    }, 5000);
  }

  /** Close all connections to the database. This function is idempotent. */
  async close() {
    if (this.pool.getPoolState().ended) {
      return;
    }
    clearInterval(this.statsdInterval);
    return await this.pool.end();
  }

  private async query<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
    return await this.pool.connect(async (conn) => {
      const client = new PostgresClient(createPoolConnection(conn));
      return await fn(client);
    });
  }

  /** Initiate a new database transaction. All `DbAdapter` methods called within
   * the provided callback `fn` are executed within the same transaction.
   * */
  async transaction<T>(
    fn: (adapter: PostgresClient) => Promise<T>,
  ): Promise<T> {
    return await this.pool.connect(async (conn) => {
      return await conn.transaction(async (tx) => {
        const client = new PostgresClient(createTransactionConnection(tx));
        return await fn(client);
      });
    });
  }

  createEntityType(
    params: Parameters<DbClient["createEntityType"]>[0],
  ): Promise<EntityType> {
    return this.query((adapter) => adapter.createEntityType(params));
  }

  createEntity(
    params: Parameters<DbClient["createEntity"]>[0],
  ): Promise<DbEntity> {
    return this.query((adapter) => adapter.createEntity(params));
  }

  getEntityAccountId(
    params: Parameters<DbClient["getEntityAccountId"]>[0],
  ): Promise<string> {
    return this.query((adapter) => adapter.getEntityAccountId(params));
  }

  getEntity(
    params: Parameters<DbClient["getEntity"]>[0],
  ): Promise<DbEntity | undefined> {
    return this.query((adapter) => adapter.getEntity(params));
  }

  getEntityLatestVersion(
    params: Parameters<DbClient["getEntityLatestVersion"]>[0],
  ): Promise<DbEntity | undefined> {
    return this.query((adapter) => adapter.getEntityLatestVersion(params));
  }

  getEntityType(
    params: Parameters<DbClient["getEntityType"]>[0],
  ): ReturnType<DbClient["getEntityType"]> {
    return this.query((adapter) => adapter.getEntityType(params));
  }

  getEntityTypeLatestVersion(
    params: Parameters<DbClient["getEntityTypeLatestVersion"]>[0],
  ): Promise<EntityType | null> {
    return this.query((adapter) => adapter.getEntityTypeLatestVersion(params));
  }

  getSystemTypeLatestVersion(
    params: Parameters<DbClient["getSystemTypeLatestVersion"]>[0],
  ): Promise<EntityType> {
    return this.query((adapter) => adapter.getSystemTypeLatestVersion(params));
  }

  getEntityTypeByComponentId(
    params: Parameters<DbClient["getEntityTypeByComponentId"]>[0],
  ): Promise<EntityType | null> {
    return this.query((adapter) => adapter.getEntityTypeByComponentId(params));
  }

  getEntityTypeBySchema$id(
    params: Parameters<DbClient["getEntityTypeBySchema$id"]>[0],
  ): ReturnType<DbClient["getEntityTypeBySchema$id"]> {
    return this.query((adapter) => adapter.getEntityTypeBySchema$id(params));
  }

  getEntityTypeChildren(
    params: Parameters<DbClient["getEntityTypeChildren"]>[0],
  ): ReturnType<DbClient["getEntityTypeChildren"]> {
    return this.query((adapter) => adapter.getEntityTypeChildren(params));
  }

  updateEntityType(
    params: Parameters<DbClient["updateEntityType"]>[0],
  ): ReturnType<DbClient["updateEntityType"]> {
    return this.query((adapter) => adapter.updateEntityType(params));
  }

  updateEntity(
    params: Parameters<DbClient["updateEntity"]>[0],
  ): Promise<DbEntity> {
    return this.query((adapter) => adapter.updateEntity(params));
  }

  updateEntityAccountId(
    params: Parameters<DbClient["updateEntityAccountId"]>[0],
  ): Promise<void> {
    return this.query((adapter) => adapter.updateEntityAccountId(params));
  }

  getUserByEmail(
    params: Parameters<DbClient["getUserByEmail"]>[0],
  ): Promise<DbEntity | null> {
    return this.query((adapter) => adapter.getUserByEmail(params));
  }

  getUserByShortname(
    params: Parameters<DbClient["getUserByShortname"]>[0],
  ): Promise<DbEntity | null> {
    return this.query((adapter) => adapter.getUserByShortname(params));
  }

  getOrgByShortname(
    params: Parameters<DbClient["getOrgByShortname"]>[0],
  ): Promise<DbEntity | null> {
    return this.query((adapter) => adapter.getOrgByShortname(params));
  }

  getEntitiesByType(
    params: Parameters<DbClient["getEntitiesByType"]>[0],
  ): Promise<DbEntity[]> {
    return this.query((adapter) => adapter.getEntitiesByType(params));
  }

  getEntitiesBySystemType(
    params: Parameters<DbClient["getEntitiesBySystemType"]>[0],
  ): Promise<DbEntity[]> {
    return this.query((adapter) => adapter.getEntitiesBySystemType(params));
  }

  accountExists(
    params: Parameters<DbClient["accountExists"]>[0],
  ): Promise<boolean> {
    return this.query((adapter) => adapter.accountExists(params));
  }

  getAllAccounts(): Promise<DbEntity[]> {
    return this.query((adapter) => adapter.getAllAccounts());
  }

  updateEntityMetadata(
    params: Parameters<DbClient["updateEntityMetadata"]>[0],
  ): Promise<EntityMeta> {
    return this.query((adapter) => adapter.updateEntityMetadata(params));
  }

  createLink(params: Parameters<DbClient["createLink"]>[0]): Promise<DbLink> {
    return this.query((adapter) => adapter.createLink(params));
  }

  updateLink(params: Parameters<DbClient["updateLink"]>[0]): Promise<DbLink> {
    return this.query((adapter) => adapter.updateLink(params));
  }

  getLink(params: Parameters<DbClient["getLink"]>[0]): Promise<DbLink | null> {
    return this.query((adapter) => adapter.getLink(params));
  }

  deleteLink(params: Parameters<DbClient["deleteLink"]>[0]): Promise<void> {
    return this.query((adapter) => adapter.deleteLink(params));
  }

  getEntityOutgoingLinks(
    params: Parameters<DbClient["getEntityOutgoingLinks"]>[0],
  ): ReturnType<DbClient["getEntityOutgoingLinks"]> {
    return this.query((adapter) => adapter.getEntityOutgoingLinks(params));
  }

  getEntityIncomingLinks(
    params: Parameters<DbClient["getEntityIncomingLinks"]>[0],
  ): ReturnType<DbClient["getEntityIncomingLinks"]> {
    return this.query((adapter) => adapter.getEntityIncomingLinks(params));
  }

  createAggregation(
    params: Parameters<DbClient["createAggregation"]>[0],
  ): Promise<DbAggregation> {
    return this.query((adapter) => adapter.createAggregation(params));
  }

  updateAggregationOperation(
    params: Parameters<DbClient["updateAggregationOperation"]>[0],
  ): Promise<DbAggregation> {
    return this.query((adapter) => adapter.updateAggregationOperation(params));
  }

  getEntityAggregation(
    params: Parameters<DbClient["getEntityAggregation"]>[0],
  ): Promise<DbAggregation | null> {
    return this.query((adapter) => adapter.getEntityAggregation(params));
  }

  getEntityAggregations(
    params: Parameters<DbClient["getEntityAggregations"]>[0],
  ): Promise<DbAggregation[]> {
    return this.query((adapter) => adapter.getEntityAggregations(params));
  }

  deleteAggregation(
    params: Parameters<DbClient["deleteAggregation"]>[0],
  ): Promise<void> {
    return this.query((adapter) => adapter.deleteAggregation(params));
  }

  createVerificationCode(
    params: Parameters<DbClient["createVerificationCode"]>[0],
  ): Promise<VerificationCode> {
    return this.query((adapter) => adapter.createVerificationCode(params));
  }

  getVerificationCode(
    params: Parameters<DbClient["getVerificationCode"]>[0],
  ): Promise<VerificationCode | null> {
    return this.query((adapter) => adapter.getVerificationCode(params));
  }

  getUserVerificationCodes(
    params: Parameters<DbClient["getUserVerificationCodes"]>[0],
  ): Promise<VerificationCode[]> {
    return this.query((adapter) => adapter.getUserVerificationCodes(params));
  }

  incrementVerificationCodeAttempts(
    params: Parameters<DbClient["incrementVerificationCodeAttempts"]>[0],
  ): Promise<void> {
    return this.query((adapter) =>
      adapter.incrementVerificationCodeAttempts(params),
    );
  }

  setVerificationCodeToUsed(
    params: Parameters<DbClient["setVerificationCodeToUsed"]>[0],
  ): Promise<void> {
    return this.query((adapter) => adapter.setVerificationCodeToUsed(params));
  }

  pruneVerificationCodes(
    params: Parameters<DbClient["pruneVerificationCodes"]>[0],
  ): Promise<number> {
    return this.query((adapter) => adapter.pruneVerificationCodes(params));
  }

  getEntityHistory(
    params: Parameters<DbClient["getEntityHistory"]>[0],
  ): Promise<EntityVersion[]> {
    return this.query((adapter) => adapter.getEntityHistory(params));
  }

  getEntities(
    entities: {
      accountId: string;
      entityId: string;
      entityVersionId?: string;
    }[],
  ): Promise<DbEntity[]> {
    return this.query((adapter) => adapter.getEntities(entities));
  }

  getAccountEntities(
    params: Parameters<DbClient["getAccountEntities"]>[0],
  ): ReturnType<DbClient["getAccountEntities"]> {
    return this.query((adapter) => adapter.getAccountEntities(params));
  }

  getAccountEntityTypes(
    params: Parameters<DbClient["getAccountEntityTypes"]>[0],
  ): Promise<EntityType[]> {
    return this.query((adapter) => adapter.getAccountEntityTypes(params));
  }

  acquireEntityLock(
    params: Parameters<DbClient["getEntityAccountId"]>[0],
  ): Promise<null> {
    return this.query((adapter) => adapter.acquireEntityLock(params));
  }

  getImpliedEntityHistory(
    params: Parameters<DbClient["getImpliedEntityHistory"]>[0],
  ) {
    return this.query((adapter) => adapter.getImpliedEntityHistory(params));
  }

  getAncestorReferences(
    params: Parameters<DbClient["getAncestorReferences"]>[0],
  ) {
    return this.query((adapter) => adapter.getAncestorReferences(params));
  }

  getSystemAccountId() {
    return this.query((adapter) => adapter.getSystemAccountId());
  }

  getChildren(params: Parameters<DbClient["getChildren"]>[0]) {
    return this.query((adapter) => adapter.getChildren(params));
  }
}
