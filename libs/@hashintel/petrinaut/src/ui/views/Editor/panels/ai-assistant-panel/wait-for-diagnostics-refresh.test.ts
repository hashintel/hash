import { describe, expect, it } from "vitest";

import {
  pendingDiagnosticsContext,
  waitForDiagnosticsRefresh,
} from "./wait-for-diagnostics-refresh";

/**
 * A manual clock: each scheduled poll runs when the test advances time, so
 * the bounded wait is driven deterministically and never sleeps.
 */
const manualClock = () => {
  let time = 0;
  const queue: { at: number; callback: () => void }[] = [];
  return {
    now: () => time,
    schedule: (callback: () => void, delay: number) => {
      queue.push({ at: time + delay, callback });
    },
    advance: (by: number) => {
      const until = time + by;
      while (queue.length > 0 && queue[0]!.at <= until) {
        const next = queue.shift()!;
        time = next.at;
        next.callback();
      }
      time = until;
    },
  };
};

const armed = (ref: { current: number | null }) => {
  const cell = ref;
  return {
    peek: () => cell.current,
    disarm: (version: number) => {
      if (cell.current === version) cell.current = null;
    },
  };
};

const waitWith = (
  clock: ReturnType<typeof manualClock>,
  refs: {
    pendingMutationDiagnosticsVersionRef: { current: number | null };
    diagnosticsVersionRef: { current: number };
  },
) =>
  waitForDiagnosticsRefresh({
    pendingMutationDiagnosticsVersion: armed(
      refs.pendingMutationDiagnosticsVersionRef,
    ),
    diagnosticsVersionRef: refs.diagnosticsVersionRef,
    timeoutMs: 1_000,
    pollMs: 25,
    now: clock.now,
    schedule: clock.schedule,
  });

describe("waitForDiagnosticsRefresh", () => {
  it("is current at once when no mutation is pending", async () => {
    await expect(
      waitForDiagnosticsRefresh({
        pendingMutationDiagnosticsVersion: armed({ current: null }),
        diagnosticsVersionRef: { current: 3 },
      }),
    ).resolves.toBe("current");
  });

  it("is current at once, and disarms, when diagnostics already passed the mutation's version", async () => {
    const pendingMutationDiagnosticsVersionRef = { current: 2 };
    await expect(
      waitForDiagnosticsRefresh({
        pendingMutationDiagnosticsVersion: armed(
          pendingMutationDiagnosticsVersionRef,
        ),
        diagnosticsVersionRef: { current: 3 },
      }),
    ).resolves.toBe("current");
    expect(pendingMutationDiagnosticsVersionRef.current).toBeNull();
  });

  it("becomes current when diagnostics catch up within the bound", async () => {
    const clock = manualClock();
    const refs = {
      pendingMutationDiagnosticsVersionRef: { current: 2 as number | null },
      diagnosticsVersionRef: { current: 2 },
    };
    const outcome = waitWith(clock, refs);
    clock.advance(100);
    refs.diagnosticsVersionRef.current = 3;
    clock.advance(25);
    await expect(outcome).resolves.toBe("current");
    expect(refs.pendingMutationDiagnosticsVersionRef.current).toBeNull();
  });

  it("reports pending when the bound elapses; pending is not a diagnostics report", async () => {
    const clock = manualClock();
    // Diagnostics never advance: the refresh for the just-applied mutation
    // has not landed, so whatever context the panel holds is the old version.
    const refs = {
      pendingMutationDiagnosticsVersionRef: { current: 2 as number | null },
      diagnosticsVersionRef: { current: 2 },
    };
    const outcome = waitWith(clock, refs);
    clock.advance(1_000);
    await expect(outcome).resolves.toBe("pending");
    expect(pendingDiagnosticsContext).not.toMatch(/compiles|No errors/iu);
    expect(pendingDiagnosticsContext).toMatch(/pending/u);
  });

  it("a timed-out read leaves the version armed, so the next read cannot answer from the old diagnostics", async () => {
    const clock = manualClock();
    const refs = {
      pendingMutationDiagnosticsVersionRef: { current: 2 as number | null },
      diagnosticsVersionRef: { current: 2 },
    };
    await (async () => {
      const first = waitWith(clock, refs);
      clock.advance(1_000);
      await expect(first).resolves.toBe("pending");
    })();
    expect(refs.pendingMutationDiagnosticsVersionRef.current).toBe(2);

    // Still no refresh: the second read is pending too, not a success.
    const second = waitWith(clock, refs);
    clock.advance(1_000);
    await expect(second).resolves.toBe("pending");

    // Once diagnostics do pass the version, the read is current and disarms.
    refs.diagnosticsVersionRef.current = 3;
    await expect(waitWith(clock, refs)).resolves.toBe("current");
    expect(refs.pendingMutationDiagnosticsVersionRef.current).toBeNull();
  });

  it("does not disarm a newer version that a later mutation left while it waited", async () => {
    const clock = manualClock();
    const refs = {
      pendingMutationDiagnosticsVersionRef: { current: 2 as number | null },
      diagnosticsVersionRef: { current: 2 },
    };
    const outcome = waitWith(clock, refs);
    clock.advance(50);
    // A second mutation lands and re-arms for version 3 before diagnostics
    // for version 2 arrive.
    refs.pendingMutationDiagnosticsVersionRef.current = 3;
    refs.diagnosticsVersionRef.current = 3;
    clock.advance(25);
    await expect(outcome).resolves.toBe("current");
    expect(refs.pendingMutationDiagnosticsVersionRef.current).toBe(3);
  });
});
