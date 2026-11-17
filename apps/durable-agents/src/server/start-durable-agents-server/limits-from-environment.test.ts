import { expect, test } from "vitest";

import { defaultServerLimits } from "../durable-agents-server";
import { limitsFromEnvironment } from "./limits-from-environment";

test("an empty environment gives the defaults", () => {
  expect(limitsFromEnvironment({})).toEqual(defaultServerLimits);
  expect(defaultServerLimits).toEqual({
    maxTurns: 100,
    maxConcurrentRequests: 16,
    abandonedTurnMs: 600_000,
    crashLoopRestarts: 5,
  });
});

test("a blank variable gives its default", () => {
  expect(
    limitsFromEnvironment({ DURABLE_AGENTS_MAX_TURNS: " " }).maxTurns,
  ).toBe(100);
});

test("valid values override the defaults", () => {
  expect(
    limitsFromEnvironment({
      DURABLE_AGENTS_MAX_TURNS: "3",
      DURABLE_AGENTS_MAX_CONCURRENT_REQUESTS: "1",
      DURABLE_AGENTS_ABANDONED_TURN_MS: " 2500 ",
      DURABLE_AGENTS_CRASH_LOOP_RESTARTS: "7",
    }),
  ).toEqual({
    maxTurns: 3,
    maxConcurrentRequests: 1,
    abandonedTurnMs: 2500,
    crashLoopRestarts: 7,
  });
});

test("only the crash-loop threshold takes Infinity", () => {
  expect(
    limitsFromEnvironment({ DURABLE_AGENTS_CRASH_LOOP_RESTARTS: "Infinity" })
      .crashLoopRestarts,
  ).toBe(Infinity);
  for (const name of [
    "DURABLE_AGENTS_MAX_TURNS",
    "DURABLE_AGENTS_MAX_CONCURRENT_REQUESTS",
    "DURABLE_AGENTS_ABANDONED_TURN_MS",
  ]) {
    expect(() => limitsFromEnvironment({ [name]: "Infinity" })).toThrow(name);
  }
});

test.each(["0", "-1", "1.5", "ten", "1e400", "-Infinity", "0x"])(
  "%j throws for every variable",
  (raw) => {
    for (const name of [
      "DURABLE_AGENTS_MAX_TURNS",
      "DURABLE_AGENTS_MAX_CONCURRENT_REQUESTS",
      "DURABLE_AGENTS_ABANDONED_TURN_MS",
      "DURABLE_AGENTS_CRASH_LOOP_RESTARTS",
    ]) {
      expect(() => limitsFromEnvironment({ [name]: raw })).toThrow(name);
    }
  },
);
