/**
 * Apply the schema migration files. If "refresh" is passed as the first argument
 * then the script will drop everything in the database before applying the schema.
 * This option is only valid when the database is running on localhost.
 *
 * Examples:
 *  node migration.js
 *
 *  node migration.js refresh
 */
const pg = require("pg");
const path = require("path");
const fs = require("fs");

const main = async () => {
  const cfg = {
    host: process.env.HASH_PG_HOST || "localhost",
    user: process.env.HASH_PG_USER || "postgres",
    port: process.env.HASH_PG_PORT ? parseInt(process.env.HASH_PG_PORT) : 5432,
    database: process.env.HASH_PG_DATABASE || "postgres",
    password: process.env.HASH_PG_PASSWORD || "postgres",
  };

  let refresh = false;
  if (process.argv.length > 2 && process.argv[2] === "refresh") {
    if (cfg.host !== "localhost") {
      console.error("A refresh may only be performed on a localhost database.");
      process.exit(1);
    }
    refresh = true;
  }

  const pool = new pg.Pool(cfg);

  const tx = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await fn(client);
      await client.query("COMMIT");
      return res;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  };

  if (refresh) {
    console.log("Refreshing the database");
    await tx(async (client) => {
      await client.query("drop schema public cascade");
      await client.query("create schema public;");
    });
  }

  const schemaDir = path.join(__dirname, "schema/");
  const schemaFiles = fs.readdirSync(schemaDir);
  schemaFiles.sort();

  for (const name of schemaFiles) {
    console.log(`Applying ${name}`);
    const sql = fs.readFileSync(path.join(schemaDir, name)).toString();
    await tx(async (client) => await client.query(sql));
  }

  await pool.end();

  console.log("Schema migration complete");
};

(async () => {
  await main();
})();
