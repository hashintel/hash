/* eslint-disable no-console -- OK for CLI scripts */
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
import pg from "pg";
import path from "path";
import fs from "fs";
import yargs from "yargs";
import prompts from "prompts";

const cliDescription = `Database schema migration runner

Database credentials may be passed using the options as described below,
or using the environment variables: HASH_PG_HOST, HASH_PG_USER, HASH_PG_PORT
and HASH_PG_DATABASE.

HASH_PG_PASSWORD, if set, will be used as the password, otherwise you
will be prompted for the password.`;

const main = async () => {
  const argv = yargs(process.argv.slice(2))
    .usage("$0", cliDescription)
    .version(false)
    .option("host", {
      description: "Postgres host",
      type: "string",
    })
    .option("user", {
      description: "Postgres user",
      type: "string",
    })
    .option("database", {
      description: "Postgres database",
      type: "string",
    })
    .option("port", {
      description: "Postgres port",
      number: true,
    })
    .option("yes", {
      boolean: true,
      description: "Do not ask for confirmation",
    })
    .help("help").argv;

  const user = argv.user || process.env.HASH_PG_USER || "postgres";
  const host = argv.host || process.env.HASH_PG_HOST || "localhost";

  let password = process.env.HASH_PG_PASSWORD;
  if (!password) {
    if (host === "localhost") {
      password = "postgres";
    } else {
      const resp = await prompts([
        {
          type: "password",
          name: "password",
          message: `Password for user ${user}`,
        },
      ]);
      password = resp.password;
    }
  }

  // Force confirmation when not on localhost
  if (host !== "localhost" && !argv.yes) {
    const { yes } = await prompts([
      {
        type: "text",
        name: "yes",
        message: `Run schema migration on ${host}? Please type 'yes'`,
      },
    ]);
    if (yes !== "yes") {
      process.stderr.write("Operation cancelled\n");
      return;
    }
  }

  const cfg: pg.PoolConfig = {
    host,
    user,
    port: argv.port
      ? argv.port
      : process.env.HASH_PG_PORT
      ? parseInt(process.env.HASH_PG_PORT, 10)
      : 5432,
    database: argv.database || process.env.HASH_PG_DATABASE || "postgres",
    password: password || process.env.HASH_PG_PASSWORD || "postgres",
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

  const tx = async (fn: (client: pg.PoolClient) => void) => {
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
    await tx(async (client: pg.PoolClient) => {
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

void (async () => {
  await main();
})();
