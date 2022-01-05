import pg from "pg";

const main = async () => {
  const host = process.env.HASH_PG_HOST || "localhost";
  const user = process.env.HASH_PG_USER || "postgres";
  const database = process.env.HASH_PG_DATABASE || "postgres";
  const password = process.env.HASH_PG_PASSWORD || "postgres";
  const port = parseInt(process.env.HASH_PG_PORT || "5432", 10);

  if (host !== "localhost") {
    console.error(
      "For safety reasons it is only allowed to reset databases on localhost",
    );
    process.exit(1);
  }

  const serverClient = new pg.Client({ host, user, port, password });
  await serverClient.connect();

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
