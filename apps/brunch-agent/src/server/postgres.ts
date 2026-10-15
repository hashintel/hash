import { readFileSync } from "node:fs";

import { Signer, type SignerConfig } from "@aws-sdk/rds-signer";
import { Pool } from "pg";

import { brunchEnv } from "@hashintel/brunch-agent";

import { type PostgresDatabaseConfig } from "./database-config.ts";
import { diagnostics } from "./runtime-diagnostics.ts";
import { errorCode, recordOperationalFailure } from "./telemetry.ts";

import type { PostgresParameter, PostgresRunner } from "@flue/postgres";
import type { PoolConfig } from "pg";

interface QueryClient {
  query(
    text: string,
    values?: PostgresParameter[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

interface ReleasableQueryClient extends QueryClient {
  release(error?: Error | boolean): void;
}

interface QueryPool extends QueryClient {
  connect(): Promise<ReleasableQueryClient>;
  end(): Promise<void>;
}

interface ConnectionOptions {
  readonly onPoolError?: (error: Error) => void;
  readonly readTlsCa?: (path: string) => string;
  readonly signerFactory?: (
    config: Required<
      Pick<SignerConfig, "hostname" | "port" | "region" | "username">
    >,
  ) => Pick<Signer, "getAuthToken">;
}

export const POSTGRES_CONNECTION_TIMEOUT_MS = 10_000;
// Bounds a query on a connection that died without a reset; otherwise the
// client stays checked out and `pool.end()` never resolves.
export const POSTGRES_QUERY_TIMEOUT_MS = 30_000;

const defaultSignerFactory: NonNullable<ConnectionOptions["signerFactory"]> = (
  config,
) => new Signer(config);

const reportDatabaseFailure = async (error: unknown): Promise<void> => {
  diagnostics.report("database.operation", error);
  try {
    await recordOperationalFailure("database_operation", error);
  } catch {
    // Preserve the database failure as the authoritative operational cause.
  }
};

const reportFailureInBackground = (
  reportFailure: (error: unknown) => Promise<void>,
  error: unknown,
): void => {
  void reportFailure(error).catch(() => {
    // Preserve the database failure as the authoritative operational cause.
  });
};

export function createPostgresPoolConfig(
  config: PostgresDatabaseConfig,
  options: ConnectionOptions = {},
): PoolConfig {
  const readTlsCa =
    options.readTlsCa ??
    ((path: string) => {
      try {
        return readFileSync(path, "utf8");
      } catch (error) {
        // The code (ENOENT, EACCES, EISDIR) is enough to act on; the path
        // stays out of the message and out of the logs.
        throw new Error(
          `Unable to read ${brunchEnv.postgres.tlsCaPath} (${errorCode(error) ?? "unknown"}).`,
          { cause: error },
        );
      }
    });
  const common: PoolConfig = {
    application_name: "brunch-agent",
    connectionTimeoutMillis: POSTGRES_CONNECTION_TIMEOUT_MS,
    query_timeout: POSTGRES_QUERY_TIMEOUT_MS,
    statement_timeout: POSTGRES_QUERY_TIMEOUT_MS,
    database: config.database,
    host: config.host,
    port: config.port,
    ssl: {
      ca: readTlsCa(config.tlsCaPath),
      rejectUnauthorized: true,
    },
    user: config.user,
  };

  if (config.auth.mode === "password") {
    return { ...common, password: config.auth.password };
  }

  const signer = (options.signerFactory ?? defaultSignerFactory)({
    hostname: config.host,
    port: config.port,
    region: config.auth.region,
    username: config.user,
  });
  return {
    ...common,
    password: async () => signer.getAuthToken(),
  };
}

export const createPostgresPool = (
  config: PostgresDatabaseConfig,
  options?: ConnectionOptions,
): Pool => {
  const pool = new Pool(createPostgresPoolConfig(config, options));
  pool.on("error", (error) => {
    if (options?.onPoolError) {
      options.onPoolError(error);
      return;
    }
    // Idle clients fail outside any request, so nothing else reports this;
    // the diagnostic sink's console transport keeps it visible even while
    // the collector is unreachable.
    void reportDatabaseFailure(error);
  });
  return pool;
};

export function createPostgresRunnerFromPool(
  pool: QueryPool,
  afterClose?: () => Promise<void>,
  reportFailure: (error: unknown) => Promise<void> = reportDatabaseFailure,
): PostgresRunner {
  const query = async (
    text: string,
    params?: PostgresParameter[],
  ): Promise<Record<string, unknown>[]> => {
    try {
      // SQL text comes only from Flue's trusted persistence adapter; request
      // values remain separate parameters.
      // nosemgrep: javascript.express.db.pg-express.pg-express
      return (await pool.query(text, params)).rows;
    } catch (error) {
      reportFailureInBackground(reportFailure, error);
      throw error;
    }
  };

  return {
    query,
    transaction: async <T>(
      run: (transaction: { query: typeof query }) => Promise<T>,
    ): Promise<T> => {
      let client: ReleasableQueryClient | undefined;
      try {
        client = await pool.connect();
        const transactionClient = client;
        const transactionQuery = async (
          text: string,
          params?: PostgresParameter[],
        ): Promise<Record<string, unknown>[]> =>
          (await transactionClient.query(text, params)).rows;
        await transactionClient.query("BEGIN");
        const result = await run({ query: transactionQuery });
        await transactionClient.query("COMMIT");
        return result;
      } catch (error) {
        let failure: unknown = error;
        if (client !== undefined) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            const failedClient = client;
            client = undefined;
            failedClient.release(true);
            failure = new AggregateError(
              [error, rollbackError],
              "Postgres transaction and rollback both failed.",
            );
          }
        }
        reportFailureInBackground(reportFailure, failure);
        throw failure;
      } finally {
        client?.release();
      }
    },
    close: async () => {
      // Drain the pool before the telemetry providers go away, so the last
      // database spans are still exported.
      const failures: unknown[] = [];
      try {
        await pool.end();
      } catch (error) {
        failures.push(error);
      }
      try {
        await afterClose?.();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          "Postgres or telemetry shutdown failed.",
        );
      }
    },
  };
}

export const createPostgresRunner = (
  config: PostgresDatabaseConfig,
  afterClose?: () => Promise<void>,
): PostgresRunner =>
  createPostgresRunnerFromPool(createPostgresPool(config), afterClose);
