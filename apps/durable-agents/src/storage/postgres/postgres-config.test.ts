import { expect, test } from "vitest";

import {
  defaultPoolLimits,
  poolLimitsFromEnvironment,
} from "./postgres-config";

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
