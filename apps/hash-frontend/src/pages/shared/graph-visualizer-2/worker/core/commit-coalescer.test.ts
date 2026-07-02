/**
 * Policy guards for {@link CommitCoalescer}: first-enqueue flush (cold-load
 * latency), drain-deferred coalescing, the batch-count / age backstops, and
 * the cross-batch delta merge (sums per group, first `previousCount` /
 * `isNewGroup` win, `rebuildTree` rides the merged commit exactly once).
 */
import { describe, expect, it } from "vitest";

import { TypeSetKey } from "../../ids";
import {
  type CoalescedCommit,
  CommitCoalescer,
  MAX_COALESCE_DELAY_MS,
  MAX_COALESCED_BATCHES,
} from "./commit-coalescer";

import type { IngestDelta } from "../hierarchy/cluster-tree";

function delta(
  groupKey: string,
  growth: number,
  opts?: { isNewGroup?: boolean; previousCount?: number },
): IngestDelta {
  return {
    groupKey: TypeSetKey(groupKey),
    delta: growth,
    isNewGroup: opts?.isNewGroup ?? false,
    previousCount: opts?.previousCount ?? 0,
  };
}

interface Harness {
  readonly coalescer: CommitCoalescer;
  readonly commits: CoalescedCommit[];
  /** Deliver the pending drain message, as the event loop would after a burst. */
  fireDrain(): void;
  advanceClock(ms: number): void;
}

function newHarness(): Harness {
  const commits: CoalescedCommit[] = [];
  let clock = 0;
  let pendingFire: (() => void) | undefined;
  const coalescer = new CommitCoalescer({
    commit: (opts) => commits.push(opts),
    now: () => clock,
    scheduleDrain: (fire) => {
      pendingFire = fire;
    },
  });
  return {
    coalescer,
    commits,
    fireDrain() {
      const fire = pendingFire;
      pendingFire = undefined;
      fire?.();
    },
    advanceClock(ms) {
      clock += ms;
    },
  };
}

/** A harness whose first-flush latch is already spent (steady-state stream). */
function primedHarness(): Harness {
  const harness = newHarness();
  harness.coalescer.enqueueDeltas([delta("g0", 1)]);
  harness.commits.length = 0;
  return harness;
}

describe("CommitCoalescer, latency policy", () => {
  it("flushes the very first enqueue synchronously (cold-load first paint)", () => {
    const harness = newHarness();
    harness.coalescer.enqueueDeltas([
      delta("people", 10, { isNewGroup: true }),
    ]);

    expect(harness.commits).toHaveLength(1);
    expect(harness.coalescer.hasPending).toBe(false);
  });

  it("defers subsequent batches to the drain, producing one merged commit", () => {
    const harness = primedHarness();

    harness.coalescer.enqueueDeltas([delta("people", 5)]);
    harness.coalescer.enqueueDeltas([delta("people", 7)]);
    harness.coalescer.enqueueDeltas([delta("orgs", 3, { isNewGroup: true })]);
    expect(harness.commits).toHaveLength(0);
    expect(harness.coalescer.hasPending).toBe(true);

    harness.fireDrain();

    expect(harness.commits).toHaveLength(1);
    expect(harness.coalescer.hasPending).toBe(false);
  });

  it("batches separated by a drain land in separate commits (progressive paint)", () => {
    const harness = primedHarness();

    harness.coalescer.enqueueDeltas([delta("people", 5)]);
    harness.fireDrain();
    harness.coalescer.enqueueDeltas([delta("people", 7)]);
    harness.fireDrain();

    expect(harness.commits).toHaveLength(2);
  });

  it("caps a sustained burst at MAX_COALESCED_BATCHES even if the drain never fires", () => {
    const harness = primedHarness();

    for (let batch = 0; batch < MAX_COALESCED_BATCHES; batch++) {
      harness.coalescer.enqueueDeltas([delta("people", 1)]);
    }

    expect(harness.commits).toHaveLength(1);
    expect(harness.coalescer.hasPending).toBe(false);
  });

  it("caps deferral age at MAX_COALESCE_DELAY_MS (checked at enqueue)", () => {
    const harness = primedHarness();

    harness.coalescer.enqueueDeltas([delta("people", 1)]);
    harness.advanceClock(MAX_COALESCE_DELAY_MS);
    harness.coalescer.enqueueDeltas([delta("people", 1)]);

    expect(harness.commits).toHaveLength(1);
  });

  it("a drain arriving after a cap flush is a no-op, not an empty commit", () => {
    const harness = primedHarness();

    for (let batch = 0; batch < MAX_COALESCED_BATCHES; batch++) {
      harness.coalescer.enqueueDeltas([delta("people", 1)]);
    }
    expect(harness.commits).toHaveLength(1);

    harness.fireDrain();
    expect(harness.commits).toHaveLength(1);
  });

  it("explicit flush() commits pending state and reports whether it ran", () => {
    const harness = primedHarness();

    expect(harness.coalescer.flush()).toBe(false);
    harness.coalescer.enqueueDeltas([delta("people", 5)]);
    expect(harness.coalescer.flush()).toBe(true);
    expect(harness.commits).toHaveLength(1);
    expect(harness.coalescer.flush()).toBe(false);
  });
});

describe("CommitCoalescer, merged-delta semantics", () => {
  it("sums per-group deltas; previousCount/isNewGroup keep the first batch's values", () => {
    const harness = primedHarness();

    harness.coalescer.enqueueDeltas([
      delta("people", 5, { isNewGroup: true, previousCount: 0 }),
    ]);
    harness.coalescer.enqueueDeltas([
      delta("people", 7, { isNewGroup: false, previousCount: 5 }),
      delta("orgs", 2, { isNewGroup: false, previousCount: 40 }),
    ]);
    harness.fireDrain();

    const [commit] = harness.commits;
    expect(commit!.deltas).toEqual([
      { groupKey: "people", delta: 12, isNewGroup: true, previousCount: 0 },
      { groupKey: "orgs", delta: 2, isNewGroup: false, previousCount: 40 },
    ]);
  });

  it("merges a mid-burst rebuildTree into the burst's single commit, exactly once", () => {
    const harness = primedHarness();

    harness.coalescer.enqueueDeltas([delta("people", 5)]);
    harness.coalescer.enqueueRebuildTree();
    harness.coalescer.enqueueDeltas([delta("people", 3)]);
    harness.fireDrain();

    expect(harness.commits).toHaveLength(1);
    expect(harness.commits[0]!.rebuildTree).toBe(true);
    expect(harness.commits[0]!.deltas).toEqual([
      { groupKey: "people", delta: 8, isNewGroup: false, previousCount: 0 },
    ]);

    // The flag must not leak into the next burst.
    harness.coalescer.enqueueDeltas([delta("people", 1)]);
    harness.fireDrain();
    expect(harness.commits[1]!.rebuildTree).toBe(false);
  });

  it("counts a link-only batch (no deltas) so the commit still lands", () => {
    const harness = primedHarness();

    harness.coalescer.enqueueDeltas([]);
    expect(harness.coalescer.hasPending).toBe(true);

    harness.fireDrain();
    expect(harness.commits).toHaveLength(1);
    expect(harness.commits[0]!.deltas).toEqual([]);
  });
});
