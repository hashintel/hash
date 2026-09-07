import { postgres } from "@flue/postgres";

import { loadDatabaseConfig } from "./database-config.ts";
import { conversationDbPath } from "./db-path.ts";
import { createPostgresRunner } from "./postgres.ts";
import { shutdownBrunchTelemetry } from "./telemetry-bootstrap.ts";
import { recordOperationalFailure } from "./telemetry.ts";

/**
 * The substrate's conversation storage — host-authored because Flue requires
 * it of the consuming app.
 *
 * Production must provide the Postgres contract and cannot fall back to a
 * task-local file; local development and hermetic tests keep SQLite.
 */
const openDatabase = async () => {
  try {
    const config = loadDatabaseConfig();
    return config.kind === "postgres"
      ? postgres(createPostgresRunner(config, shutdownBrunchTelemetry))
      : (await import("@flue/runtime/node")).sqlite(conversationDbPath());
  } catch (error) {
    // The process exits right after this, so flush the failure span first.
    await recordOperationalFailure("database_configuration", error);
    try {
      await shutdownBrunchTelemetry();
    } catch {
      // The database failure remains the authoritative startup cause.
    }
    throw error;
  }
};

const database = await openDatabase();

export default database;
