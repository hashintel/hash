import { sleep } from "@hashintel/hash-shared/sleep";

import {
  getRequiredEnv,
  waitOnResource,
} from "@hashintel/hash-backend-utils/environment";

import pg from "pg";

const main = async () => {
  const host = getRequiredEnv("HASH_PG_HOST");
  const user = getRequiredEnv("HASH_PG_USER");
  const database = getRequiredEnv("HASH_PG_DATABASE");
  const password = getRequiredEnv("HASH_PG_PASSWORD");
  const port = parseInt(getRequiredEnv("HASH_PG_PORT"), 10);

  if (host !== "localhost") {
    console.error(
      "For safety reasons it is only allowed to reset databases on localhost",
    );
    process.exit(1);
  }

  await waitOnResource(`tcp:${host}:${port}`, console);

  let serverClient;
  while (!serverClient) {
    try {
      serverClient = new pg.Client({ host, user, port, password });
      await serverClient.connect();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Connection terminated unexpectedly"
      ) {
        console.error(
          `Error connecting to Postgres server (${host}:${port}). The instance might be warming up. Retrying...`,
        );
        await sleep(1000);
        serverClient = undefined;
      } else {
        throw error;
      }
    }
  }

  const databaseAlreadyExists =
    (
      await serverClient.query(`select from pg_database where datname = $1`, [
        database,
      ])
    ).rowCount > 0;

  if (databaseAlreadyExists) {
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
    await databaseClient.query(`drop schema if exists public cascade`);
    await databaseClient.query(`drop schema if exists realtime cascade`);
    await databaseClient.query(`create schema public`);
    console.log(`Database ${database} was recreated`);
    await databaseClient.end();
  } else {
    await serverClient.query(`create database ${database}`);
    console.log(`Database ${database} was created`);
  }

  await serverClient.end();
};

void (async () => {
  await main();
})();
