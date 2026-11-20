import {
  type Environment,
  integerFromEnvironment,
} from "../../shared/integer-from-environment";

import type { PoolConfig } from "pg";

const postgresVariables = {
  host: "DURABLE_AGENTS_POSTGRES_HOST",
  port: "DURABLE_AGENTS_POSTGRES_PORT",
  user: "DURABLE_AGENTS_POSTGRES_USER",
  password: "DURABLE_AGENTS_POSTGRES_PASSWORD",
  database: "DURABLE_AGENTS_POSTGRES_DATABASE",
} as const;

/** What `pg-pool` rejects with when no connection comes within `connectionTimeoutMillis`: none freed, or none opened. */
const connectTimeoutMessages = new Set([
  "timeout exceeded when trying to connect",
  "Connection terminated due to connection timeout",
]);

/**
 * Whether `error`, or an error it was caused by, is the pool failing to give a
 * connection within its `connectionTimeoutMillis`: a saturated pool or an
 * unreachable server, which a caller may answer as unavailable for now.
 */
export const isPoolConnectTimeout = (error: unknown): boolean => {
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    if (connectTimeoutMessages.has(current.message)) return true;
    if (
      current instanceof AggregateError &&
      current.errors.some((inner) => isPoolConnectTimeout(inner))
    )
      return true;
    seen.add(current);
    current = current.cause;
  }
  return false;
};

/**
 * Connection to the compose Postgres (`infra/compose`) unless the `DURABLE_AGENTS_POSTGRES_*` variables, then compose's
 * `POSTGRES_*` variables, say otherwise. No TLS: this is for local runs, not Brunch's deployed configuration.
 */
export const postgresConfigFromEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): PoolConfig => ({
  application_name: "durable-agents",
  host: environment[postgresVariables.host] ?? "localhost",
  port: Number(
    environment[postgresVariables.port] ?? environment.POSTGRES_PORT ?? 5432,
  ),
  user:
    environment[postgresVariables.user] ??
    environment.POSTGRES_USER ??
    "postgres",
  password:
    environment[postgresVariables.password] ??
    environment.POSTGRES_PASSWORD ??
    "postgres",
  database: environment[postgresVariables.database] ?? "postgres",
});

/** The pool's limits, as `pg` names them. */
export type PoolLimits = Required<
  Pick<PoolConfig, "max" | "connectionTimeoutMillis">
>;

export const defaultPoolLimits: PoolLimits = {
  max: 32,
  connectionTimeoutMillis: 10_000,
};

const poolVariables = {
  max: "DURABLE_AGENTS_PG_POOL_MAX",
  connectionTimeoutMillis: "DURABLE_AGENTS_PG_POOL_WAIT_MS",
} as const satisfies Record<keyof PoolLimits, string>;

/**
 * The pool's limits from the environment, each over `defaultPoolLimits`, to
 * spread over its connection config:
 *
 * - `DURABLE_AGENTS_PG_POOL_MAX` (32): connections the pool opens at most,
 *   `pg`'s `max`.
 * - `DURABLE_AGENTS_PG_POOL_WAIT_MS` (10000): how long a query waits for a
 *   connection, a free one or a new one, before it fails; `pg`'s
 *   `connectionTimeoutMillis`.
 *
 * Each is an integer of 1 or more; any other value throws, so a typo does
 * not silently run on the default.
 */
export const poolLimitsFromEnvironment = (
  environment: Environment,
): PoolLimits => ({
  max: integerFromEnvironment(
    environment,
    poolVariables.max,
    defaultPoolLimits.max,
    { infinite: false },
  ),
  connectionTimeoutMillis: integerFromEnvironment(
    environment,
    poolVariables.connectionTimeoutMillis,
    defaultPoolLimits.connectionTimeoutMillis,
    { infinite: false },
  ),
});
