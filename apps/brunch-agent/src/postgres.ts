import { readFileSync } from "node:fs";

import { Signer } from "@aws-sdk/rds-signer";
import { Pool } from "pg";

import {
  type PostgresDatabaseConfig,
  POSTGRES_ENV,
} from "./database-config.ts";
import { recordOperationalFailure } from "./telemetry.ts";

import type { PostgresParameter, PostgresRunner } from "@flue/postgres";
import type { PoolConfig } from "pg";

interface QueryClient {
  query(
    text: string,
    values?: PostgresParameter[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

interface ReleasableQueryClient extends QueryClient {
  release(): void;
}

interface QueryPool extends QueryClient {
  connect(): Promise<ReleasableQueryClient>;
  end(): Promise<void>;
}

interface ConnectionOptions {
  readonly onIamToken?: () => void;
  readonly onPoolError?: (error: Error) => void;
  readonly readTlsCa?: (path: string) => string;
  readonly signerFactory?: (config: {
    hostname: string;
    port: number;
    region: string;
    username: string;
  }) => Pick<Signer, "getAuthToken">;
}

export const POSTGRES_CONNECTION_TIMEOUT_MS = 10_000;

const defaultSignerFactory: NonNullable<ConnectionOptions["signerFactory"]> = (
  config,
) => new Signer(config);

const reportDatabaseFailure = async (error: unknown): Promise<void> => {
  try {
    await recordOperationalFailure("database_operation", error);
  } catch {
    // Preserve the database failure as the authoritative operational cause.
  }
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
      } catch {
        throw new Error(`Unable to read ${POSTGRES_ENV.tlsCaPath}.`);
      }
    });
  const common: PoolConfig = {
    application_name: "brunch-agent",
    connectionTimeoutMillis: POSTGRES_CONNECTION_TIMEOUT_MS,
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
    password: async () => {
      const token = await signer.getAuthToken();
      options.onIamToken?.();
      return token;
    },
  };
}

export const createPostgresPool = (
  config: PostgresDatabaseConfig,
  options?: ConnectionOptions,
): Pool => {
  const pool = new Pool(createPostgresPoolConfig(config, options));
  pool.on("error", (error) => {
    options?.onPoolError?.(error);
    if (options?.onPoolError === undefined) void reportDatabaseFailure(error);
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
      await reportFailure(error);
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
            failure = new AggregateError(
              [error, rollbackError],
              "Postgres transaction and rollback both failed.",
            );
          }
        }
        await reportFailure(failure);
        throw failure;
      } finally {
        client?.release();
      }
    },
    close: async () => {
      const results = await Promise.allSettled([pool.end(), afterClose?.()]);
      const failures = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason as unknown] : [],
      );
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

export interface RdsIamProbeResult {
  readonly distinctBackendConnections: boolean;
  readonly tokenRequests: number;
}

interface RdsIamProbeClient {
  query<T>(text: string): Promise<{ rows: T[] }>;
  release(): void;
}

interface RdsIamProbePool {
  connect(): Promise<RdsIamProbeClient>;
  end(): Promise<void>;
}

interface RdsIamProbeOptions {
  readonly createPool?: (
    config: PostgresDatabaseConfig,
    onIamToken: () => void,
  ) => RdsIamProbePool;
}

/**
 * Verify that task credentials can open two independent TLS connections and
 * that node-postgres requests a fresh IAM token for each physical connection.
 */
export async function probeRdsIam(
  config: PostgresDatabaseConfig,
  options: RdsIamProbeOptions = {},
): Promise<RdsIamProbeResult> {
  if (config.auth.mode !== "iam") {
    throw new Error("The RDS IAM probe requires IAM authentication mode.");
  }

  let tokenRequests = 0;
  const onIamToken = () => {
    tokenRequests += 1;
  };
  const pool =
    options.createPool?.(config, onIamToken) ??
    createPostgresPool(config, { onIamToken });
  const clients: RdsIamProbeClient[] = [];
  try {
    clients.push(await pool.connect());
    clients.push(await pool.connect());
    const results = await Promise.all(
      clients.map((client) =>
        client.query<{ backendProcessId: number }>(
          'SELECT pg_backend_pid() AS "backendProcessId"',
        ),
      ),
    );
    const backendProcessIds = results.map(
      (result) => result.rows[0]?.backendProcessId,
    );
    return {
      distinctBackendConnections:
        backendProcessIds.length === 2 &&
        backendProcessIds[0] !== undefined &&
        backendProcessIds[1] !== undefined &&
        backendProcessIds[0] !== backendProcessIds[1],
      tokenRequests,
    };
  } finally {
    for (const client of clients) {
      client.release();
    }
    await pool.end();
  }
}
