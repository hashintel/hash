import { postgres } from "@flue/postgres";

import { loadDatabaseConfig } from "./database-config.ts";
import { conversationDbPath } from "./db-path.ts";
import { createPostgresRunner } from "./postgres.ts";
import { diagnostics } from "./runtime-diagnostics.ts";
import { standardWorkedModelFixtures } from "./standard-worked-model-fixtures.ts";
import { shutdownBrunchTelemetry } from "./telemetry-bootstrap.ts";
import { recordOperationalFailure } from "./telemetry.ts";
import {
  createInMemoryWorkedModelStore,
  createPostgresWorkedModelStore,
} from "./worked-model-store.ts";

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
    if (config.kind === "postgres") {
      const runner = createPostgresRunner(config, shutdownBrunchTelemetry);
      const workedModelStore = createPostgresWorkedModelStore(runner);
      await workedModelStore.seed(standardWorkedModelFixtures);
      return {
        database: postgres(runner),
        workedModelStore,
      };
    }
    const workedModelStore = createInMemoryWorkedModelStore();
    await workedModelStore.seed(standardWorkedModelFixtures);
    return {
      database: (await import("@flue/runtime/node")).sqlite(
        conversationDbPath(),
      ),
      workedModelStore,
    };
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

const opened = await openDatabase();

export const workedModelStore = opened.workedModelStore;

export default opened.database;
