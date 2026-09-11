import { describe, expect, it } from "vitest";

import { RUN_POLICY } from "./calibration";
import { runCalibratedExperiment } from "./run-phase";

import type { CompiledNetShader } from "../compile-net-shader";
import type { GpuExperimentResult } from "../runner";
import type {
  AttemptResult,
  CalibrationSession,
  ExecuteAttempt,
} from "./calibration";

/** A shader whose only relevant facts are its size and its derived places. */
const shaderAt = (
  capacities: ReadonlyMap<string, number>,
): CompiledNetShader => {
  const slabWords = [...capacities.values()].reduce(
    (sum, capacity) => sum + capacity * 2,
    0,
  );
  return {
    wgsl: "",
    stateWordsPerRun: 4 + slabWords,
    summaryWordsPerRun: 2 + capacities.size,
    placeCountOffsets: [0],
    placeTokenOffsets: [4],
    placeTokenStrides: [2],
    summaryStatusOffset: 1,
    rngOffset: 2,
    statusOffset: 3,
    derivedCapacityPlaceIndices: [...capacities.keys()].map(() => 0),
    metricIds: ["m0"],
    histogramBins: 64,
    runParameterIds: [],
    compiledLambdas: [],
  };
};

const session = (capacities: Record<string, number>): CalibrationSession => {
  const initial = new Map(Object.entries(capacities));
  return {
    backend: {
      recompile: (next) => ({ ok: true, shader: shaderAt(next) }),
      profile: {
        places: [
          {
            id: "p",
            name: "P",
            capacity: initial.get("p") ?? 0,
            capacitySource: "derived",
            declaredCapacity: 0xffffffff,
            realFields: ["x", "y"],
            discreteFields: [],
            colored: true,
            pairConsumed: false,
          },
        ],
        uncolouredOnly: false,
        bytesPerRun: 16,
      },
    },
    shader: shaderAt(initial),
    capacities: initial,
  };
};

const outcome = (
  overrides: Partial<GpuExperimentResult> = {},
): GpuExperimentResult => ({
  cancelled: false,
  frames: [],
  finalPlaceCounts: new Uint32Array(0),
  deadlockedRuns: 0,
  completedRuns: 0,
  overflowRuns: 0,
  derivedPlaceMaxes: [{ max: 10, meanRunMax: 8 }],
  dispatchMs: 0,
  metricRanges: [{ min: 20, max: 40, below: 0, above: 0 }],
  metricErrors: [],
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
      attempts.map(({ runCount, preview }) => ({ runCount, preview })),
    ).toEqual([
      { runCount: 128, preview: false },
      { runCount: 1000, preview: true },
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
    // Another selection's slabs undersize this one past RUN_POLICY's budget:
    // rather than failing, the run probes as a first batch would.
    const current = session({ p: 10 });
    const overflowing = Array.from(
      { length: 1 + RUN_POLICY.maxSlabGrowths },
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
    // The probe starts from the grown slabs, never below them.
    expect(current.capacities.get("p")).toBe(154);
    expect(remembered).toHaveLength(1);
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
