import { describe, expect, it } from "vitest";

import {
  createOptimizationRunOwners,
  OPTIMIZATION_RUN_OWNER_TTL_MS,
} from "./optimization-run-owners";

describe("createOptimizationRunOwners", () => {
  it("tracks ownership per run and per account", () => {
    const owners = createOptimizationRunOwners();

    owners.register("run-1", { accountId: "user-1", requestedTrials: 5 });

    expect(owners.get("run-1")).toMatchObject({
      accountId: "user-1",
      requestedTrials: 5,
    });
    expect(owners.hasLiveRunForAccount("user-1")).toBe(true);
    expect(owners.hasLiveRunForAccount("user-2")).toBe(false);

    owners.release("run-1");
    expect(owners.get("run-1")).toBeUndefined();
    expect(owners.hasLiveRunForAccount("user-1")).toBe(false);
  });

  it("expires entries after the TTL as a lazy backstop", () => {
    let now = 1_000_000;
    const owners = createOptimizationRunOwners(() => now);

    owners.register("run-1", { accountId: "user-1", requestedTrials: 5 });

    now += OPTIMIZATION_RUN_OWNER_TTL_MS - 1;
    expect(owners.get("run-1")).toBeDefined();
    expect(owners.hasLiveRunForAccount("user-1")).toBe(true);

    now += 1;
    expect(owners.get("run-1")).toBeUndefined();
    expect(owners.hasLiveRunForAccount("user-1")).toBe(false);
  });
});
