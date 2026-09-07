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
 * Local development and hermetic tests retain SQLite. Production must provide
 * the dedicated Postgres contract and cannot fall back to a task-local file.
 */
const createDatabase = async () => {
  try {
    const config = loadDatabaseConfig();
    return config.kind === "postgres"
      ? postgres(createPostgresRunner(config, shutdownBrunchTelemetry))
      : (await import("@flue/runtime/node")).sqlite(conversationDbPath());
  } catch (error) {
    recordOperationalFailure("database_configuration", error);
    throw error;
  }
};

export default await createDatabase();
