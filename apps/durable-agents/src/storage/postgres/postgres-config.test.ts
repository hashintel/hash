import { SessionFailed } from "@earendil-works/pi-durable";
import { expect, test } from "vitest";

import {
  defaultPoolLimits,
  isPoolConnectTimeout,
  poolLimitsFromEnvironment,
  postgresConfigFromEnvironment,
} from "./postgres-config";

test("a pool connect timeout is found through a failed Session's cause", () => {
  const timeout = new Error("timeout exceeded when trying to connect");
  expect(isPoolConnectTimeout(new SessionFailed(timeout))).toBe(true);
  expect(
    isPoolConnectTimeout(new SessionFailed(new Error("Session is closed"))),
  ).toBe(false);
});

test("the connection takes durable agents' own variables, then compose's, then the compose defaults", () => {
  expect(postgresConfigFromEnvironment({})).toMatchObject({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: "postgres",
    database: "postgres",
  });
  const compose = {
    POSTGRES_PORT: "5433",
    POSTGRES_USER: "compose-user",
    POSTGRES_PASSWORD: "compose-password",
  };
  expect(postgresConfigFromEnvironment(compose)).toMatchObject({
    port: 5433,
    user: "compose-user",
    password: "compose-password",
  });
  expect(
    postgresConfigFromEnvironment({
      ...compose,
      DURABLE_AGENTS_POSTGRES_HOST: "db",
      DURABLE_AGENTS_POSTGRES_PORT: "6543",
      DURABLE_AGENTS_POSTGRES_USER: "durable",
      DURABLE_AGENTS_POSTGRES_PASSWORD: "secret",
      DURABLE_AGENTS_POSTGRES_DATABASE: "durable_agents",
    }),
  ).toMatchObject({
    host: "db",
    port: 6543,
    user: "durable",
    password: "secret",
    database: "durable_agents",
  });
});

const poolVariables = [
  "DURABLE_AGENTS_PG_POOL_MAX",
  "DURABLE_AGENTS_PG_POOL_WAIT_MS",
];

test("an empty environment gives the default pool limits", () => {
  expect(poolLimitsFromEnvironment({})).toEqual(defaultPoolLimits);
  expect(defaultPoolLimits).toEqual({
    max: 32,
    connectionTimeoutMillis: 10_000,
  });
});

test("a blank pool variable gives its default", () => {
  expect(poolLimitsFromEnvironment({ DURABLE_AGENTS_PG_POOL_MAX: "" })).toEqual(
    defaultPoolLimits,
  );
});

test("valid values override the default pool limits", () => {
  expect(
    poolLimitsFromEnvironment({
      DURABLE_AGENTS_PG_POOL_MAX: "64",
      DURABLE_AGENTS_PG_POOL_WAIT_MS: "250",
    }),
  ).toEqual({ max: 64, connectionTimeoutMillis: 250 });
});

test("no pool variable takes Infinity", () => {
  for (const name of poolVariables) {
    expect(() => poolLimitsFromEnvironment({ [name]: "Infinity" })).toThrow(
      name,
    );
  }
});

test.each(["0", "-1", "1.5", "ten", "1e400", "-Infinity", "0x"])(
  "%j throws for every pool variable",
  (raw) => {
    for (const name of poolVariables) {
      expect(() => poolLimitsFromEnvironment({ [name]: raw })).toThrow(name);
    }
  },
);
