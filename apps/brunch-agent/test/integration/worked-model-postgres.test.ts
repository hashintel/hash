import { Pool } from "pg";
import { afterAll, beforeAll, describe } from "vitest";

import { createPostgresRunnerFromPool } from "../../src/postgres.ts";
import { createPostgresWorkedModelStore } from "../../src/worked-model-store.ts";
import { workedModelStoreContract } from "../worked-model-store-contract.ts";

import type { PostgresRunner } from "@flue/postgres";

/** The compose stack's Postgres, which CI starts before every integration job. */
const connection = {
  host: "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "postgres",
  password: process.env.POSTGRES_PASSWORD ?? "postgres",
};
const database = `brunch_worked_model_test_${process.pid}`;
const admin = new Pool({ ...connection, database: "postgres" });
let runner: PostgresRunner;

beforeAll(async () => {
  await admin.query(`CREATE DATABASE ${database}`);
  // The contract provokes rejected updates; they are expected, not failures to report.
  runner = createPostgresRunnerFromPool(
    new Pool({ ...connection, database }),
    undefined,
    async () => {},
  );
});

afterAll(async () => {
  await runner.close();
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
  await admin.end();
});

describe("worked-model net-projection store in Postgres", () => {
  workedModelStoreContract(async (createId) => {
    await runner.query("DROP TABLE IF EXISTS brunch_worked_model_copies");
    await runner.query("DROP TABLE IF EXISTS brunch_worked_model_fixtures");
    return createPostgresWorkedModelStore(runner, createId);
  });
});
