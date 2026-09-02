import { postgres } from "@flue/postgres";

import { loadDatabaseConfig } from "./database-config.ts";
import { conversationDbPath } from "./db-path.ts";
import { createPostgresRunner } from "./postgres.ts";
import { shutdownBrunchTelemetry } from "./telemetry-bootstrap.ts";
import { recordOperationalFailure } from "./telemetry.ts";

import type { DatabaseConfig } from "./database-config.ts";

/**
 * The substrate's conversation storage — host-authored because Flue requires
 * it of the consuming app.
 *
 * Local development and hermetic tests retain SQLite. Production must provide
 * the dedicated Postgres contract and cannot fall back to a task-local file.
 */
let config: DatabaseConfig;
try {
  config = loadDatabaseConfig();
} catch (error) {
  try {
    await recordOperationalFailure("database_configuration", error);
  } catch {
    // The database configuration error remains the authoritative startup cause.
  }
  throw error;
}

const database =
  config.kind === "postgres"
    ? postgres(createPostgresRunner(config, shutdownBrunchTelemetry))
    : (await import("@flue/runtime/node")).sqlite(conversationDbPath());

export default database;
