import * as path from "path";
import { spawnSync } from "child_process";

import { Pool } from "pg";

const createPool = () => {
  const user = process.env.HASH_PG_USER || "postgres";
  const host = process.env.HASH_PG_HOST || "localhost";
  const port = process.env.HASH_PG_PORT || "5432";
  const database = "integration_tests";
  const password = process.env.HASH_PG_PASSWORD || "postgres";

  return new Pool({
    user,
    host,
    port: parseInt(port || "5432"),
    database,
    password,
  });
};

export class IntegrationTestsHandler {
  private pool: Pool;

  constructor() {
    this.pool = createPool();
  }

  /** Initializes the integration test handler and refreshes the database schema. */
  async init() {
    // Refresh the database schema and run the migration script
    await this.pool.query("drop schema if exists public cascade;");
    await this.pool.query("create schema public;");
    const migration = spawnSync("yarn", ["migration"], {
      env: {
        ...process.env,
        HASH_PG_DATABASE: "integration_tests",
      },
      cwd: path.join(__dirname, "../../../backend/datastore/postgres"),
    });
    if (migration.status !== 0) {
      console.error(
        `Error running database schema migration script:\n${migration.stderr}`
      );
      process.exit(1);
    }
  }

  async close() {
    await this.pool.end();
  }
}
