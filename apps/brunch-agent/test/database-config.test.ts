import { describe, expect, test } from "vitest";

import { loadDatabaseConfig, POSTGRES_ENV } from "../src/database-config.ts";

const productionEnvironment = {
  NODE_ENV: "production",
  [POSTGRES_ENV.authMode]: "iam",
  [POSTGRES_ENV.awsRegion]: "eu-central-1",
  [POSTGRES_ENV.database]: "brunch",
  [POSTGRES_ENV.host]: "brunch.example.rds.amazonaws.com",
  [POSTGRES_ENV.port]: "5432",
  [POSTGRES_ENV.tlsCaPath]: "/run/config/rds-ca.pem",
  [POSTGRES_ENV.user]: "brunch_agent",
} as const;

describe("database configuration", () => {
  test("keeps SQLite outside production", () => {
    expect(loadDatabaseConfig({ NODE_ENV: "test" })).toEqual({
      kind: "sqlite",
    });
  });

  test("loads dedicated IAM fields in production", () => {
    expect(loadDatabaseConfig(productionEnvironment)).toEqual({
      kind: "postgres",
      auth: { mode: "iam", region: "eu-central-1" },
      database: "brunch",
      host: "brunch.example.rds.amazonaws.com",
      port: 5432,
      tlsCaPath: "/run/config/rds-ca.pem",
      user: "brunch_agent",
    });
  });

  test("trims values supplied through secret and config injection", () => {
    expect(
      loadDatabaseConfig({
        ...productionEnvironment,
        [POSTGRES_ENV.awsRegion]: " eu-central-1\n",
        [POSTGRES_ENV.host]: " brunch.example.rds.amazonaws.com\n",
        [POSTGRES_ENV.port]: " 5432\n",
        [POSTGRES_ENV.user]: " brunch_agent\n",
      }),
    ).toMatchObject({
      auth: { mode: "iam", region: "eu-central-1" },
      host: "brunch.example.rds.amazonaws.com",
      port: 5432,
      user: "brunch_agent",
    });
  });

  test("loads a runtime-injected password without accepting a region", () => {
    const environment = {
      ...productionEnvironment,
      [POSTGRES_ENV.authMode]: "password",
      [POSTGRES_ENV.awsRegion]: undefined,
      [POSTGRES_ENV.password]: "secret-for-test",
    };
    expect(loadDatabaseConfig(environment)).toMatchObject({
      kind: "postgres",
      auth: { mode: "password", password: "secret-for-test" },
    });
  });

  test.each([
    [POSTGRES_ENV.host, undefined],
    [POSTGRES_ENV.database, ""],
    [POSTGRES_ENV.port, "0"],
    [POSTGRES_ENV.port, "5432.5"],
    [POSTGRES_ENV.port, "65536"],
  ])("rejects invalid required field %s", (name, value) => {
    expect(() =>
      loadDatabaseConfig({ ...productionEnvironment, [name]: value }),
    ).toThrow(name);
  });

  test.each(["DATABASE_URL", "BRUNCH_DEV_DB_PATH", "BRUNCH_CHAT_DB_PATH"])(
    "rejects legacy production input %s",
    (name) => {
      expect(() =>
        loadDatabaseConfig({
          ...productionEnvironment,
          [name]: "must-not-be-accepted",
        }),
      ).toThrow(name);
    },
  );

  test("rejects contradictory authentication inputs without exposing values", () => {
    const password = "must-not-appear-in-the-error";
    expect(() =>
      loadDatabaseConfig({
        ...productionEnvironment,
        [POSTGRES_ENV.password]: password,
      }),
    ).toThrow(POSTGRES_ENV.password);

    let errorMessage = "";
    try {
      loadDatabaseConfig({
        ...productionEnvironment,
        [POSTGRES_ENV.password]: password,
      });
    } catch (error) {
      errorMessage = String(error);
    }
    expect(errorMessage).not.toContain(password);
  });
});
