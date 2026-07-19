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
    expect(owners.findLiveRunForAccount("user-1")).toMatchObject({
      runId: "run-1",
      owner: { accountId: "user-1", requestedTrials: 5 },
    });
    expect(owners.hasLiveRunForAccount("user-1")).toBe(true);
    expect(owners.hasLiveRunForAccount("user-2")).toBe(false);

    owners.release("run-1");
    expect(owners.get("run-1")).toBeUndefined();
    expect(owners.findLiveRunForAccount("user-1")).toBeUndefined();
    expect(owners.hasLiveRunForAccount("user-1")).toBe(false);
  });

  it("expires untouched entries after the TTL as a lazy backstop", () => {
    let now = 1_000_000;
    const owners = createOptimizationRunOwners(() => now);

    owners.register("run-1", { accountId: "user-1", requestedTrials: 5 });

    // Account-level checks do not refresh the inactivity clock, so a run
    // whose owner never attaches expires on schedule.
    now += OPTIMIZATION_RUN_OWNER_TTL_MS - 1;
    expect(owners.hasLiveRunForAccount("user-1")).toBe(true);

    now += 1;
    expect(owners.hasLiveRunForAccount("user-1")).toBe(false);
    expect(owners.get("run-1")).toBeUndefined();
  });

  it("keeps a recently touched entry alive past the created-at TTL", () => {
    let now = 1_000_000;
    const owners = createOptimizationRunOwners(() => now);

    owners.register("run-1", { accountId: "user-1", requestedTrials: 5 });

    // An attach or cancel lookup refreshes the inactivity clock…
    now += OPTIMIZATION_RUN_OWNER_TTL_MS - 1;
    expect(owners.get("run-1")).toBeDefined();

    // …so the entry survives well past its created-at age while in use.
    now += OPTIMIZATION_RUN_OWNER_TTL_MS - 1;
    expect(owners.get("run-1")).toBeDefined();
    expect(owners.hasLiveRunForAccount("user-1")).toBe(true);

    // Once lookups stop, the inactivity TTL still expires the entry.
    now += OPTIMIZATION_RUN_OWNER_TTL_MS;
    expect(owners.get("run-1")).toBeUndefined();
    expect(owners.hasLiveRunForAccount("user-1")).toBe(false);
  });
});
