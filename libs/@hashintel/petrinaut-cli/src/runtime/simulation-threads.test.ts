import { availableParallelism } from "node:os";

import { describe, expect, it } from "vitest";

import {
  defaultSimulationThreads,
  resolveSimulationThreads,
} from "./simulation-threads";

describe("resolveSimulationThreads", () => {
  it("leaves one core for the protocol thread by default", () => {
    expect(resolveSimulationThreads(undefined)).toBe(
      Math.max(1, availableParallelism() - 1),
    );
    expect(defaultSimulationThreads()).toBeGreaterThanOrEqual(1);
  });

  it("accepts an explicit positive integer", () => {
    expect(resolveSimulationThreads("1")).toBe(1);
    expect(resolveSimulationThreads("8")).toBe(8);
  });

  it("rejects anything that is not a positive integer", () => {
    for (const value of ["0", "-2", "1.5", "four", ""]) {
      expect(() => resolveSimulationThreads(value)).toThrow(
        "--threads requires a positive integer",
      );
    }
  });
});
