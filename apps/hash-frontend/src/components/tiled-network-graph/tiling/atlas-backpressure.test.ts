import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enterPrincipal } from "../../../shared/principal-scoped-state";
import {
  isAtlasSpeculationPaused,
  noteAtlasBudget,
  noteAtlasRateLimited,
  parseAtlasBudgets,
  refundAtlasRequestToken,
  resetAtlasBackpressure,
  takeAtlasRequestToken,
} from "./atlas-backpressure";

describe("atlas backpressure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAtlasBackpressure();
  });

  it("is not paused until a rate limit is noted", () => {
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("pauses for the floor when the refusal names no wait", () => {
    noteAtlasRateLimited();
    expect(isAtlasSpeculationPaused()).toBe(true);

    vi.setSystemTime(1_999);
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(2_000);
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("honours a stated wait beyond the floor", () => {
    noteAtlasRateLimited(30_000);

    vi.setSystemTime(29_999);
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(30_000);
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("caps a stated wait at five minutes", () => {
    noteAtlasRateLimited(60 * 60_000);

    vi.setSystemTime(5 * 60_000 - 1);
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(5 * 60_000);
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("never shortens a pause already standing", () => {
    noteAtlasRateLimited(30_000);
    noteAtlasRateLimited(1_000);

    vi.setSystemTime(10_000);
    expect(isAtlasSpeculationPaused()).toBe(true);
  });

  it("resets for tests", () => {
    noteAtlasRateLimited(30_000);
    resetAtlasBackpressure();
    expect(isAtlasSpeculationPaused()).toBe(false);
  });
});

describe("parseAtlasBudgets", () => {
  it("joins policy and limit items by budget name", () => {
    expect(
      parseAtlasBudgets(
        '"gate";q=50;w=5, "actor";q=100;w=60',
        '"gate";r=46, "actor";r=93',
      ),
    ).toEqual([
      { name: "gate", remaining: 46, quota: 50, windowSeconds: 5 },
      { name: "actor", remaining: 93, quota: 100, windowSeconds: 60 },
    ]);
  });

  it("reports a limit item whose policy is absent with undefined quota", () => {
    expect(parseAtlasBudgets(null, '"gate";r=3')).toEqual([
      {
        name: "gate",
        remaining: 3,
        quota: undefined,
        windowSeconds: undefined,
      },
    ]);
  });

  it("skips malformed items instead of failing the field", () => {
    expect(
      parseAtlasBudgets('"gate";q=junk;w=5, 10;w=1', 'r=9, "gate";r=-2;x, ""'),
    ).toEqual([
      {
        name: "gate",
        remaining: undefined,
        quota: undefined,
        windowSeconds: 5,
      },
    ]);
  });

  it("returns nothing for absent headers", () => {
    expect(parseAtlasBudgets(null, null)).toEqual([]);
  });
});

describe("noteAtlasBudget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAtlasBackpressure();
  });

  it("does not pause while every budget sits at or above the reserve", () => {
    noteAtlasBudget('"gate";q=50;w=5', '"gate";r=24');
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("pauses for the refill time the policy implies when a budget runs low", () => {
    // Gate refills 50 per 5s (10/s); 10 below the reserve of 24 -> 1s.
    noteAtlasBudget('"gate";q=50;w=5', '"gate";r=14');
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(999);
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(1_000);
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("pauses for the floor when the low budget's policy is unreadable", () => {
    noteAtlasBudget(null, '"gate";r=3');
    vi.setSystemTime(1_999);
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(2_000);
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("treats a zero-window policy as unreadable", () => {
    // w=0 would mean an infinite refill rate; as a model it would project
    // `0 * Infinity` into a sticky NaN, and as a reserve wait it would read
    // an empty budget as instantly refilled. Both degrade to the floor.
    noteAtlasBudget('"gate";q=10;w=0', '"gate";r=0');
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(1_999);
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(2_000);
    expect(isAtlasSpeculationPaused()).toBe(false);
    // No pacing model was minted from the garbage rate: dispatch stays free.
    expect(takeAtlasRequestToken()).toBe(0);
    expect(takeAtlasRequestToken()).toBe(0);
  });

  it("caps a slow budget's refill wait at five minutes", () => {
    // Actor refills 100 per hour: 24 tokens would take 864s uncapped.
    noteAtlasBudget('"actor";q=100;w=3600', '"actor";r=0');
    vi.setSystemTime(5 * 60_000 - 1);
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(5 * 60_000);
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("takes the thinnest budget's wait when several run low", () => {
    noteAtlasBudget(
      '"gate";q=50;w=5, "actor";q=100;w=60',
      '"gate";r=23, "actor";r=4',
    );
    // Gate: 1 token short at 10/s = 100ms. Actor: 20 short at 100/60s = 12s.
    vi.setSystemTime(11_999);
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(12_000);
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("replaces the previous report's deadline with the fresher one", () => {
    noteAtlasBudget('"gate";q=50;w=5', '"gate";r=0');
    expect(isAtlasSpeculationPaused()).toBe(true);
    // The next response says the budget recovered: the stale pause lifts.
    noteAtlasBudget('"gate";q=50;w=5', '"gate";r=40');
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("does not let a healthy report cut a 429's standing pause", () => {
    noteAtlasRateLimited(30_000);
    noteAtlasBudget('"gate";q=50;w=5', '"gate";r=50');
    vi.setSystemTime(10_000);
    expect(isAtlasSpeculationPaused()).toBe(true);
  });

  it("keeps a standing pause when a response reports no budgets at all", () => {
    noteAtlasBudget('"gate";q=50;w=5', '"gate";r=0');
    expect(isAtlasSpeculationPaused()).toBe(true);
    // No items is no information, not a recovery.
    noteAtlasBudget(null, null);
    expect(isAtlasSpeculationPaused()).toBe(true);
  });
});

describe("takeAtlasRequestToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAtlasBackpressure();
  });

  it("dispatches freely while no budget has been reported", () => {
    expect(takeAtlasRequestToken()).toBe(0);
    expect(takeAtlasRequestToken()).toBe(0);
  });

  it("spends reported tokens, then names the refill wait", () => {
    // 10 per second: one token every 100ms.
    noteAtlasBudget('"gate";q=10;w=1', '"gate";r=2');
    expect(takeAtlasRequestToken()).toBe(0);
    expect(takeAtlasRequestToken()).toBe(0);
    expect(takeAtlasRequestToken()).toBe(100);
  });

  it("admits again once the policy's refill restores a token", () => {
    noteAtlasBudget('"gate";q=10;w=1', '"gate";r=1');
    expect(takeAtlasRequestToken()).toBe(0);
    expect(takeAtlasRequestToken()).toBeGreaterThan(0);
    vi.setSystemTime(100);
    expect(takeAtlasRequestToken()).toBe(0);
  });

  it("admits below the reserve — a ridden prefetch must pace like a required load", () => {
    // Admission is lane-blind: the reserve gates what speculation *issues*
    // (see isAtlasSpeculationPaused), never what dispatches. A stricter
    // speculative admission would be inherited by a required load riding an
    // in-flight prefetch, stalling a viewport that holds no abort signal.
    noteAtlasBudget('"gate";q=50;w=5', '"gate";r=10');
    expect(isAtlasSpeculationPaused()).toBe(true);
    expect(takeAtlasRequestToken()).toBe(0);
  });

  it("caps one ask's wait even against a slow budget", () => {
    // 100 per hour: a token every 36s; one ask never sleeps past the cap.
    noteAtlasBudget('"actor";q=100;w=3600', '"actor";r=0');
    expect(takeAtlasRequestToken()).toBe(30_000);
  });

  it("never raises the local estimate back up to a stale report", () => {
    noteAtlasBudget('"gate";q=10;w=1', '"gate";r=2');
    expect(takeAtlasRequestToken()).toBe(0);
    expect(takeAtlasRequestToken()).toBe(0);
    // An out-of-order response restates r=2; the local spends stand.
    noteAtlasBudget('"gate";q=10;w=1', '"gate";r=2');
    expect(takeAtlasRequestToken()).toBeGreaterThan(0);
  });

  it("stops pacing on a budget the server no longer reports", () => {
    // One token per hour: too slow to refill within the TTL, so the expiry
    // (not the refill) is what frees dispatch.
    noteAtlasBudget('"slow";q=1;w=3600', '"slow";r=0');
    expect(takeAtlasRequestToken()).toBeGreaterThan(0);
    vi.setSystemTime(5 * 60_000 + 1);
    expect(takeAtlasRequestToken()).toBe(0);
  });

  it("restores a refunded token", () => {
    noteAtlasBudget('"gate";q=10;w=1', '"gate";r=1');
    expect(takeAtlasRequestToken()).toBe(0);
    expect(takeAtlasRequestToken()).toBeGreaterThan(0);

    refundAtlasRequestToken();
    expect(takeAtlasRequestToken()).toBe(0);
  });

  it("caps a refund at the burst", () => {
    noteAtlasBudget('"gate";q=2;w=1', '"gate";r=2');
    refundAtlasRequestToken();
    // Still two tokens, not three: the refund cannot mint past the burst.
    expect(takeAtlasRequestToken()).toBe(0);
    expect(takeAtlasRequestToken()).toBe(0);
    expect(takeAtlasRequestToken()).toBeGreaterThan(0);
  });

  it("does not pace a new principal from the previous user's depleted budget", () => {
    enterPrincipal("actor-a");
    // Actor-a drained the slow actor budget and stood under a refusal pause.
    noteAtlasBudget('"actor";q=100;w=3600', '"actor";r=0');
    noteAtlasRateLimited(60_000);
    expect(takeAtlasRequestToken()).toBeGreaterThan(0);
    expect(isAtlasSpeculationPaused()).toBe(true);

    enterPrincipal("actor-b");

    // The successor dispatches freely and their own report seeds the model
    // anew — the downward-only sync no longer pins actor-a's empty estimate.
    expect(takeAtlasRequestToken()).toBe(0);
    expect(isAtlasSpeculationPaused()).toBe(false);
    noteAtlasBudget('"actor";q=100;w=3600', '"actor";r=100');
    expect(takeAtlasRequestToken()).toBe(0);
  });
});
