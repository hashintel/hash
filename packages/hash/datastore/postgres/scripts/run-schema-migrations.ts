/* eslint-disable no-console -- OK for CLI scripts */
/**
 * Apply the schema migration files
 */
import pg from "pg";
import path from "path";
import fs from "fs";
import yargs from "yargs";
import prompts from "prompts";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";

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

  const host = argv.host || getRequiredEnv("HASH_PG_HOST");
  const user = argv.user || getRequiredEnv("HASH_PG_USER");
  const database = argv.database || getRequiredEnv("HASH_PG_DATABASE");
  const port = argv.port
    ? argv.port
    : parseInt(getRequiredEnv("HASH_PG_PORT"), 10);

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

  const poolConfig: pg.PoolConfig = { host, user, port, password, database };
  const pool = new pg.Pool(poolConfig);

  const runTransaction = async (
    fn: (client: pg.PoolClient) => Promise<void>,
  ) => {
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

  const schemaDir = path.resolve(__dirname, "../schema/");
  const schemaFiles = fs.readdirSync(schemaDir);
  schemaFiles.sort();

  for (const name of schemaFiles) {
    console.log(`Applying ${name}`);
    const schemaFilePath = path.resolve(schemaDir, name);

    const sql =
      path.extname(schemaFilePath) === ".ts"
        ? (await import(schemaFilePath)).default
        : fs.readFileSync(schemaFilePath, "utf-8");
    await runTransaction(async (client) => {
      await client.query(sql);
    });
  }

  await pool.end();

  console.log("Schema migration complete");
};

void (async () => {
  await main();
})();
