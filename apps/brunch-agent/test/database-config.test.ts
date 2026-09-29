import { describe, expect, test } from "vitest";

import { brunchEnv } from "@hashintel/brunch-agent";

import { loadDatabaseConfig } from "../src/database-config.ts";

const productionEnvironment = {
  NODE_ENV: "production",
  [brunchEnv.postgres.authMode]: "iam",
  [brunchEnv.postgres.awsRegion]: "eu-central-1",
  [brunchEnv.postgres.database]: "brunch",
  [brunchEnv.postgres.host]: "brunch.example.rds.amazonaws.com",
  [brunchEnv.postgres.port]: "5432",
  [brunchEnv.postgres.tlsCaPath]: "/run/config/rds-ca.pem",
  [brunchEnv.postgres.user]: "brunch_agent",
} as const;

describe("database configuration", () => {
  test("keeps SQLite outside production", () => {
    expect(loadDatabaseConfig({ NODE_ENV: "test" })).toEqual({
      kind: "sqlite",
    });
  });

  test.each([undefined, "development", "test"])(
    "defaults to SQLite with NODE_ENV=%s",
    (nodeEnv) => {
      expect(loadDatabaseConfig({ NODE_ENV: nodeEnv })).toEqual({
        kind: "sqlite",
      });
      expect(
        loadDatabaseConfig({ NODE_ENV: nodeEnv, BRUNCH_DB_KIND: "sqlite" }),
      ).toEqual({ kind: "sqlite" });
    },
  );

  test.each(["", " ", "mysql", "Postgres"])(
    "rejects invalid selector %j",
    (selector) => {
      for (const nodeEnv of ["development", "production"]) {
        expect(() =>
          loadDatabaseConfig({
            ...productionEnvironment,
            NODE_ENV: nodeEnv,
            BRUNCH_DB_KIND: selector,
          }),
        ).toThrow("BRUNCH_DB_KIND");
      }
    },
  );

  test("loads explicitly selected local Postgres with canonical password fields", () => {
    expect(
      loadDatabaseConfig({
        ...productionEnvironment,
        NODE_ENV: "development",
        BRUNCH_DB_KIND: "postgres",
        [brunchEnv.postgres.authMode]: "password",
        [brunchEnv.postgres.awsRegion]: undefined,
        [brunchEnv.postgres.password]: "synthetic-password",
      }),
    ).toEqual({
      kind: "postgres",
      auth: { mode: "password", password: "synthetic-password" },
      database: "brunch",
      host: "brunch.example.rds.amazonaws.com",
      port: 5432,
      tlsCaPath: "/run/config/rds-ca.pem",
      user: "brunch_agent",
    });
  });

  test.each(["development", "test", "production"])(
    "reuses IAM validation in %s",
    (nodeEnv) => {
      const environment = {
        ...productionEnvironment,
        NODE_ENV: nodeEnv,
        BRUNCH_DB_KIND: "postgres",
      };
      expect(loadDatabaseConfig(environment)).toEqual(
        loadDatabaseConfig(productionEnvironment),
      );
      for (const name of Object.values(brunchEnv.postgres).filter(
        (field) => field !== brunchEnv.postgres.password,
      )) {
        for (const value of [undefined, "", " "]) {
          expect(() =>
            loadDatabaseConfig({ ...environment, [name]: value }),
          ).toThrow(name);
        }
      }
      for (const port of ["0", "5432.5", "65536", "abc"]) {
        expect(() =>
          loadDatabaseConfig({
            ...environment,
            [brunchEnv.postgres.port]: port,
          }),
        ).toThrow(brunchEnv.postgres.port);
      }
      expect(() =>
        loadDatabaseConfig({
          ...environment,
          [brunchEnv.postgres.authMode]: "none",
        }),
      ).toThrow(brunchEnv.postgres.authMode);
      expect(() =>
        loadDatabaseConfig({
          ...environment,
          [brunchEnv.postgres.password]: "synthetic-password",
        }),
      ).toThrow(brunchEnv.postgres.password);
      const passwordEnvironment = {
        ...environment,
        [brunchEnv.postgres.authMode]: "password",
        [brunchEnv.postgres.awsRegion]: undefined,
      };
      expect(() => loadDatabaseConfig(passwordEnvironment)).toThrow(
        brunchEnv.postgres.password,
      );
      expect(() =>
        loadDatabaseConfig({
          ...passwordEnvironment,
          [brunchEnv.postgres.password]: "synthetic-password",
          [brunchEnv.postgres.awsRegion]: "eu-central-1",
        }),
      ).toThrow(brunchEnv.postgres.awsRegion);
    },
  );

  test.each(Object.values(brunchEnv.postgres))(
    "rejects %s with implicit or explicit SQLite",
    (name) => {
      for (const selector of [undefined, "sqlite"]) {
        expect(() =>
          loadDatabaseConfig({
            NODE_ENV: "development",
            BRUNCH_DB_KIND: selector,
            [name]: "",
          }),
        ).toThrow(name);
      }
    },
  );

  test.each(["DATABASE_URL", "BRUNCH_DEV_DB_PATH", "BRUNCH_CHAT_DB_PATH"])(
    "rejects conflicting local Postgres input %s",
    (name) => {
      expect(() =>
        loadDatabaseConfig({
          ...productionEnvironment,
          NODE_ENV: "development",
          BRUNCH_DB_KIND: "postgres",
          [name]: "conflicting-input",
        }),
      ).toThrow(name);
    },
  );

  test("never permits SQLite in production, even with complete Postgres fields", () => {
    expect(() =>
      loadDatabaseConfig({ NODE_ENV: "production", BRUNCH_DB_KIND: "sqlite" }),
    ).toThrow("BRUNCH_DB_KIND");
    expect(() =>
      loadDatabaseConfig({
        ...productionEnvironment,
        BRUNCH_DB_KIND: "sqlite",
      }),
    ).toThrow("BRUNCH_DB_KIND");
    expect(() => loadDatabaseConfig({ NODE_ENV: "production" })).toThrow(
      brunchEnv.postgres.authMode,
    );
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
        [brunchEnv.postgres.awsRegion]: " eu-central-1\n",
        [brunchEnv.postgres.host]: " brunch.example.rds.amazonaws.com\n",
        [brunchEnv.postgres.port]: " 5432\n",
        [brunchEnv.postgres.user]: " brunch_agent\n",
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
      [brunchEnv.postgres.authMode]: "password",
      [brunchEnv.postgres.awsRegion]: undefined,
      [brunchEnv.postgres.password]: "secret-for-test",
    };
    expect(loadDatabaseConfig(environment)).toMatchObject({
      kind: "postgres",
      auth: { mode: "password", password: "secret-for-test" },
    });
  });

  test.each([
    [brunchEnv.postgres.host, undefined],
    [brunchEnv.postgres.database, ""],
    [brunchEnv.postgres.port, "0"],
    [brunchEnv.postgres.port, "5432.5"],
    [brunchEnv.postgres.port, "65536"],
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
        [brunchEnv.postgres.password]: password,
      }),
    ).toThrow(brunchEnv.postgres.password);

    let errorMessage = "";
    try {
      loadDatabaseConfig({
        ...productionEnvironment,
        [brunchEnv.postgres.password]: password,
      });
    } catch (error) {
      errorMessage = String(error);
    }
    expect(errorMessage).not.toContain(password);
  });
});
