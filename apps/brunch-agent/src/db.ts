import { postgres } from "@flue/postgres";

import { loadDatabaseConfig } from "./server/database-config.ts";
import { conversationDbPath } from "./server/db-path.ts";
import { createPostgresRunner } from "./server/postgres.ts";
import { diagnostics } from "./server/runtime-diagnostics.ts";
import { shutdownBrunchTelemetry } from "./server/telemetry-bootstrap.ts";
import { recordOperationalFailure } from "./server/telemetry.ts";

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
    if (config.kind === "postgres")
      return postgres(createPostgresRunner(config, shutdownBrunchTelemetry));
    return (await import("@flue/runtime/node")).sqlite(conversationDbPath());
  } catch (error) {
    diagnostics.report("database.configuration", error);
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

export default await openDatabase();
