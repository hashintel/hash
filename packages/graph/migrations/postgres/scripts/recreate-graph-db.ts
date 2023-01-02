import { waitOnResource } from "@hashintel/hash-backend-utils/environment";
import pg from "pg";

import { getRequiredEnv } from "./environment";

const main = async () => {
  // Use the primary credentials when modifying the PG schema
  const host = getRequiredEnv("POSTGRES_HOST");
  const port = parseInt(getRequiredEnv("POSTGRES_PORT"), 10);
  const user = getRequiredEnv("POSTGRES_USER");
  const password = getRequiredEnv("POSTGRES_PASSWORD");

  const database = getRequiredEnv("HASH_GRAPH_PG_DATABASE");

  if (host !== "localhost") {
    console.error(
      "For safety reasons it is only allowed to reset databases on localhost",
    );
    process.exit(1);
  }

  await waitOnResource(`tcp:${host}:${port}`, console);

  const databaseClient = new pg.Client({
    host,
    user,
    port,
    password,
    database,
  });
  await databaseClient.connect();
  // Calling `drop database` would be easier, but would crash a locally running API server.
  // Recreating schemas lets Postgres clients preserve their connection during DB recreation.
  await databaseClient.query(`DROP SCHEMA IF EXISTS public CASCADE`);
  await databaseClient.query(`CREATE SCHEMA public`);

  console.log(`Database ${database} was re-created`);

  await databaseClient.end();
};

void (async () => {
  await main();
})();
