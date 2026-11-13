import type { PoolConfig } from "pg";

/** Brunch's Postgres variables (`apps/brunch-agent/src/env.ts`), which a library can't import. */
const brunchPostgresEnv = {
  host: "BRUNCH_POSTGRES_HOST",
  port: "BRUNCH_POSTGRES_PORT",
  user: "BRUNCH_POSTGRES_USER",
  password: "BRUNCH_POSTGRES_PASSWORD",
  database: "BRUNCH_POSTGRES_DATABASE",
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
 * Connection to the compose Postgres (`infra/compose`) unless Brunch's `BRUNCH_POSTGRES_*` variables, then compose's
 * `POSTGRES_*` variables, say otherwise. No TLS: this is for local runs, not Brunch's deployed configuration.
 */
export const postgresConfigFromEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): PoolConfig => ({
  application_name: "durable-agents",
  host: environment[brunchPostgresEnv.host] ?? "localhost",
  port: Number(
    environment[brunchPostgresEnv.port] ?? environment.POSTGRES_PORT ?? 5432,
  ),
  user:
    environment[brunchPostgresEnv.user] ??
    environment.POSTGRES_USER ??
    "postgres",
  password:
    environment[brunchPostgresEnv.password] ??
    environment.POSTGRES_PASSWORD ??
    "postgres",
  database: environment[brunchPostgresEnv.database] ?? "postgres",
});
