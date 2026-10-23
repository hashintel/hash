import { brunchEnv } from "@hashintel/brunch-agent";

import type { PoolConfig } from "pg";

/**
 * Connection to the compose Postgres (`infra/compose`) unless Brunch's `BRUNCH_POSTGRES_*` variables, then compose's
 * `POSTGRES_*` variables, say otherwise. No TLS: this is for local runs, not Brunch's deployed configuration.
 */
export const postgresConfigFromEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): PoolConfig => ({
  application_name: "durable-agents",
  host: environment[brunchEnv.postgres.host] ?? "localhost",
  port: Number(
    environment[brunchEnv.postgres.port] ?? environment.POSTGRES_PORT ?? 5432,
  ),
  user:
    environment[brunchEnv.postgres.user] ??
    environment.POSTGRES_USER ??
    "postgres",
  password:
    environment[brunchEnv.postgres.password] ??
    environment.POSTGRES_PASSWORD ??
    "postgres",
  database: environment[brunchEnv.postgres.database] ?? "postgres",
});
