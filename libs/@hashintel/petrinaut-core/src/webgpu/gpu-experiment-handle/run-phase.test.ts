import { describe, expect, it } from "vitest";

import { CACHED_RUN_POLICY, rememberCalibration } from "./calibration";
import { outcome as emptyOutcome, session } from "./calibration.test-helpers";
import { runCalibratedExperiment } from "./run-phase";

import type { GpuCalibration } from "../backend";
import type { GpuExperimentResult } from "../runner";
import type {
  AttemptResult,
  CalibrationSession,
  ExecuteAttempt,
} from "./calibration";

/** A runner result whose probe observed one derived place and one metric. */
const outcome = (
  overrides: Partial<GpuExperimentResult> = {},
): GpuExperimentResult =>
  emptyOutcome({
    derivedPlaceMaxes: [{ max: 10, meanRunMax: 8 }],
    metricRanges: [{ min: 20, max: 40, below: 0, above: 0 }],
    ...overrides,
  });

/** Replays scripted results and records what each attempt asked for. */
const scripted = (results: AttemptResult[]) => {
  const attempts: Parameters<ExecuteAttempt>[0][] = [];
  const execute: ExecuteAttempt = (attempt) => {
    attempts.push(attempt);
    return Promise.resolve(
      results.shift() ?? { ok: false, reason: "script exhausted" },
    );
  };
  return { execute, attempts };
};

const blind = [{ integer: true, ceiling: null }];

const runWith = (
  current: CalibrationSession,
  execute: ExecuteAttempt,
  overrides: Partial<Parameters<typeof runCalibratedExperiment>[0]> = {},
) => {
  const remembered: (readonly { lo: number; stride: number }[])[] = [];
  const run = runCalibratedExperiment({
    session: current,
    calibratedWindows: null,
    windowInputs: blind,
    placeCounts: [3],
    runCount: 1000,
    execute,
    stopped: () => false,
    remember: (windows) => remembered.push(windows),
    metricFailure: () => null,
    ...overrides,
  });
  return { run, remembered };
};

/** Reports the first halted metric over the attempt's runs, as the handle's message does. */
const haltedMetric = (
  metricErrors: readonly number[],
  runCount: number,
): string | null => {
  const halted = metricErrors.find((runs) => runs > 0);
  return halted === undefined ? null : `halted ${halted} of ${runCount} runs`;
};

describe("runCalibratedExperiment", () => {
  it("probes the derived capacities through the same execute before the full attempt", async () => {
    const current = session({ p: 64 });
    const { execute, attempts } = scripted([
      { ok: true, result: outcome() },
      { ok: true, result: outcome({ completedRuns: 1000 }) },
    ]);

    const { run, remembered } = runWith(current, execute);
    const result = await run;

    // The probe runs a prefix without a preview tile; the full attempt runs
    // everything with one, at the slab the probe sized.
    expect(
      attempts.map(({ runCount, preview, probe }) => ({
        runCount,
        preview,
        probe,
      })),
    ).toEqual([
      { runCount: 128, preview: false, probe: true },
      { runCount: 1000, preview: true, probe: false },
    ]);
    expect(attempts[1]?.shader.stateWordsPerRun).toBe(4 + 19 * 2);
    expect(remembered).toEqual([[{ lo: 14, stride: 1, integer: true }]]);
    expect(result).toMatchObject({
      kind: "calibrated",
      result: { completedRuns: 1000 },
    });
  });

  it("runs a cached calibration as a single attempt", async () => {
    const current = session({ p: 19 });
    const { execute, attempts } = scripted([{ ok: true, result: outcome() }]);

    const { run, remembered } = runWith(current, execute, {
      calibratedWindows: [{ lo: 14, stride: 1, integer: true }],
    });
    await run;

    expect(attempts).toEqual([
      expect.objectContaining({
        runCount: 1000,
        preview: true,
        windows: [{ lo: 14, stride: 1, integer: true }],
      }),
    ]);
    expect(remembered).toEqual([]);
  });

  it("probes afresh when a cached calibration still overflows after growth", async () => {
    // Another selection's slabs undersize this one past the one growth a
    // cached calibration gets: rather than failing, the run probes as a
    // first batch would.
    const current = session({ p: 10 });
    const overflowing = Array.from(
      { length: 1 + CACHED_RUN_POLICY.maxSlabGrowths },
      () => ({ ok: true as const, result: outcome({ overflowRuns: 1 }) }),
    );
    const { execute, attempts } = scripted([
      ...overflowing,
      {
        ok: true,
        result: outcome({ derivedPlaceMaxes: [{ max: 100, meanRunMax: 90 }] }),
      },
      { ok: true, result: outcome({ completedRuns: 1000 }) },
    ]);

    const { run, remembered } = runWith(current, execute, {
      calibratedWindows: [{ lo: 0, stride: 1, integer: true }],
    });
    const result = await run;

    expect(attempts.map(({ preview }) => preview)).toEqual([
      ...overflowing.map(() => true),
      false,
      true,
    ]);
    // The one growth is the probe's factor; the probe then sizes from what
    // it observed.
    expect(attempts[1]?.shader.stateWordsPerRun).toBe(4 + 40 * 2);
    expect(current.capacities.get("p")).toBe(154);
    expect(remembered).toHaveLength(1);
    expect(result).toMatchObject({
      kind: "calibrated",
      result: { completedRuns: 1000, overflowRuns: 0 },
    });
  });

  it("floors the re-probe at the grown slabs and replaces the stale entry", async () => {
    // The re-probe sees a prefix of the runs, not necessarily the one that
    // overflowed: a place it observes small keeps the grown slab, while the
    // place it observes large is sized from the observation — so the fresh
    // calibration is no smaller than the stale one anywhere and replaces it.
    const current = session({ p: 10, q: 50 });
    const key = "marking";
    const calibrations = new Map<string, GpuCalibration>();
    rememberCalibration(calibrations, key, session({ p: 10, q: 50 }), []);
    const overflowing = Array.from(
      { length: 1 + CACHED_RUN_POLICY.maxSlabGrowths },
      () => ({ ok: true as const, result: outcome({ overflowRuns: 1 }) }),
    );
    const { execute, attempts } = scripted([
      ...overflowing,
      {
        ok: true,
        result: outcome({
          derivedPlaceMaxes: [
            { max: 100, meanRunMax: 90 },
            { max: 10, meanRunMax: 8 },
          ],
        }),
      },
      { ok: true, result: outcome({ completedRuns: 1000 }) },
    ]);

    const { run } = runWith(current, execute, {
      calibratedWindows: [{ lo: 0, stride: 1, integer: true }],
      placeCounts: [3, 3],
      remember: (windows) =>
        rememberCalibration(calibrations, key, current, windows),
    });
    const result = await run;

    const grown = new Map([
      ["p", 40],
      ["q", 200],
    ]);
    const probed = new Map([
      ["p", 154],
      ["q", 200],
    ]);
    expect(current.capacities).toEqual(probed);
    expect(attempts.at(-1)?.shader.stateWordsPerRun).toBe(4 + (154 + 200) * 2);
    for (const [placeId, capacity] of probed) {
      expect(capacity).toBeGreaterThanOrEqual(grown.get(placeId)!);
    }
    expect(calibrations.get(key)?.capacities).toEqual(probed);
    expect(result).toMatchObject({
      kind: "calibrated",
      result: { completedRuns: 1000, overflowRuns: 0 },
    });
  });

  it("probes blind windows alone when no place needs a slab", async () => {
    const current = session({});
    const { execute, attempts } = scripted([
      { ok: true, result: outcome() },
      { ok: true, result: outcome() },
    ]);

    const { run, remembered } = runWith(current, execute);
    await run;

    expect(
      attempts.map(({ runCount, preview }) => ({ runCount, preview })),
    ).toEqual([
      { runCount: 128, preview: false },
      { runCount: 1000, preview: true },
    ]);
    expect(remembered).toHaveLength(1);
  });

  it("skips every probe when the windows have ceilings and no slab is derived", async () => {
    const current = session({});
    const { execute, attempts } = scripted([{ ok: true, result: outcome() }]);

    const { run } = runWith(current, execute, {
      windowInputs: [{ integer: true, ceiling: 200 }],
    });
    await run;

    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.preview).toBe(true);
  });

  it("reports a probe that concedes as failed, telling the user what to do", async () => {
    const current = session({ p: 64 });
    const { execute } = scripted([
      {
        ok: true,
        result: outcome({
          derivedPlaceMaxes: [{ max: 20_000, meanRunMax: 100 }],
        }),
      },
    ]);

    const { run } = runWith(current, execute);

    expect(await run).toMatchObject({
      kind: "failed",
      reason: /outlier runs.*Switch this experiment to the CPU backend/,
    });
  });

  it("ends the run on a metric the capacity probe halted, before the full attempt", async () => {
    const current = session({ p: 64 });
    const { execute, attempts } = scripted([
      { ok: true, result: outcome({ metricErrors: [2] }) },
      { ok: true, result: outcome({ completedRuns: 1000 }) },
    ]);

    const { run, remembered } = runWith(current, execute, {
      metricFailure: haltedMetric,
    });

    expect(await run).toEqual({
      kind: "failed",
      reason: "halted 2 of 128 runs",
    });
    expect(attempts).toHaveLength(1);
    // The slabs and windows the probe settled still serve the next batch.
    expect(remembered).toHaveLength(1);
  });

  it("ends the run on a metric the window probe halted, before the full attempt", async () => {
    const current = session({});
    const { execute, attempts } = scripted([
      { ok: true, result: outcome({ metricErrors: [1] }) },
      { ok: true, result: outcome() },
    ]);

    const { run } = runWith(current, execute, { metricFailure: haltedMetric });

    expect(await run).toEqual({
      kind: "failed",
      reason: "halted 1 of 128 runs",
    });
    expect(attempts).toHaveLength(1);
  });

  it("reports a stop during the probe as stopped, not as an error", async () => {
    const current = session({ p: 64 });
    const { execute, attempts } = scripted([
      { ok: true, result: outcome() },
      { ok: true, result: outcome() },
    ]);

    const { run } = runWith(current, execute, {
      stopped: () => attempts.length > 0,
    });

    expect(await run).toEqual({ kind: "stopped" });
    expect(attempts).toHaveLength(1);
  });
});
