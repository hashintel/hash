import { describe, expect, it } from "vitest";

import {
  probeDerivedCapacities,
  probeRunCount,
  PROBE_POLICY,
  rememberCalibration,
  RUN_POLICY,
  runUntilCalibrated,
  slabsFromProbe,
} from "./calibration";

import type { GpuCalibration } from "../backend";
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
  metricCount = 1,
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
    metricIds: Array.from({ length: metricCount }, (_, index) => `m${index}`),
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
  derivedPlaceMaxes: [],
  dispatchMs: 0,
  metricRanges: [{ min: 3, max: 9, below: 0, above: 0 }],
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

describe("runUntilCalibrated", () => {
  it("grows the slabs and recompiles after an overflow, then stops when it fits", async () => {
    const current = session({ p: 10 });
    const { execute, attempts } = scripted([
      { ok: true, result: outcome({ overflowRuns: 2 }) },
      { ok: true, result: outcome() },
    ]);

    const run = await runUntilCalibrated({
      session: current,
      runsFor: () => 1000,
      windows: [{ lo: 0, stride: 1 }],
      execute,
      policy: RUN_POLICY,
      stopped: () => false,
    });

    expect(run.ok).toBe(true);
    expect(current.capacities.get("p")).toBe(20);
    expect(attempts.map((attempt) => attempt.shader.stateWordsPerRun)).toEqual([
      24, 44,
    ]);
    expect(attempts.every((attempt) => attempt.preview)).toBe(true);
  });

  it("gives up growing after the policy's budget and hands back the overflow", async () => {
    const current = session({ p: 1 });
    const { execute, attempts } = scripted(
      Array.from({ length: 10 }, () => ({
        ok: true as const,
        result: outcome({ overflowRuns: 1 }),
      })),
    );

    const run = await runUntilCalibrated({
      session: current,
      runsFor: () => 8,
      windows: [],
      execute,
      policy: PROBE_POLICY,
      stopped: () => false,
    });

    expect(run.ok && run.result.overflowRuns).toBe(1);
    expect(attempts).toHaveLength(1 + PROBE_POLICY.maxSlabGrowths);
    expect(current.capacities.get("p")).toBe(4 ** PROBE_POLICY.maxSlabGrowths);
  });

  it("replans the windows from the observed range after an escape, once", async () => {
    const current = session({});
    const { execute, attempts } = scripted([
      {
        ok: true,
        result: outcome({
          metricRanges: [{ min: 100, max: 163, below: 0, above: 5 }],
        }),
      },
      {
        ok: true,
        result: outcome({
          metricRanges: [{ min: 100, max: 170, below: 0, above: 1 }],
        }),
      },
      { ok: true, result: outcome() },
    ]);

    const run = await runUntilCalibrated({
      session: current,
      runsFor: () => 1000,
      windows: [{ lo: 0, stride: 2 }],
      execute,
      policy: RUN_POLICY,
      stopped: () => false,
    });

    // 64 counts observed, margin max(2, ceil(64 / 64)) = 2 → [98, 165] over
    // 64 bins is a stride of 2.
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.windows).toEqual([{ lo: 98, stride: 2 }]);
    expect(run.ok && run.windows).toEqual([{ lo: 98, stride: 2 }]);
  });

  it("stops at a cancelled or abandoned attempt without retrying", async () => {
    const current = session({ p: 10 });
    const { execute, attempts } = scripted([
      { ok: true, result: outcome({ overflowRuns: 1, cancelled: true }) },
    ]);

    const run = await runUntilCalibrated({
      session: current,
      runsFor: () => 100,
      windows: [],
      execute,
      policy: RUN_POLICY,
      stopped: () => false,
    });

    expect(run.ok && run.result.cancelled).toBe(true);
    expect(attempts).toHaveLength(1);
    expect(current.capacities.get("p")).toBe(10);
  });

  it("reports a recompile failure as the reason", async () => {
    const current = session({ p: 10 });
    current.backend = {
      ...current.backend,
      recompile: () => ({ ok: false, reason: "too wide" }),
    };
    const { execute } = scripted([
      { ok: true, result: outcome({ overflowRuns: 1 }) },
    ]);

    const run = await runUntilCalibrated({
      session: current,
      runsFor: () => 100,
      windows: [],
      execute,
      policy: RUN_POLICY,
      stopped: () => false,
    });

    expect(run).toEqual({
      ok: false,
      reason: "Recompiling at a grown token capacity failed: too wide",
    });
  });
});

describe("probeRunCount", () => {
  it("probes a preview-sized prefix, shedding runs as slabs grow", () => {
    expect(probeRunCount(shaderAt(new Map([["p", 10]])), 10_000)).toBe(128);
    // 128 MiB budget over a 4 MiB run: 32 runs, never below eight.
    expect(probeRunCount(shaderAt(new Map([["p", 524_286]])), 10_000)).toBe(32);
    expect(probeRunCount(shaderAt(new Map([["p", 16_777_216]])), 10_000)).toBe(
      8,
    );
    expect(probeRunCount(shaderAt(new Map([["p", 10]])), 5)).toBe(5);
  });
});

describe("slabsFromProbe", () => {
  it("sizes a slab at the observed maximum plus margin, at least the marking", () => {
    const current = session({ p: 64 });

    expect(
      slabsFromProbe(
        current,
        outcome({ derivedPlaceMaxes: [{ max: 20, meanRunMax: 15 }] }),
        [3],
      ),
    ).toEqual({ ok: true, capacities: new Map([["p", 34]]) });
    expect(
      slabsFromProbe(
        current,
        outcome({ derivedPlaceMaxes: [{ max: 1, meanRunMax: 1 }] }),
        [40],
      ),
    ).toEqual({ ok: true, capacities: new Map([["p", 40]]) });
  });

  it("refuses a heavy tail whose slab would exceed the arena threshold", () => {
    const current = session({ p: 64 });

    const result = slabsFromProbe(
      current,
      outcome({ derivedPlaceMaxes: [{ max: 20_000, meanRunMax: 100 }] }),
      [0],
    );

    expect(result).toMatchObject({ ok: false, reason: /outlier runs/ });
  });
});

describe("probeDerivedCapacities", () => {
  it("recompiles at the probed slabs and seeds the windows with margin", async () => {
    const current = session({ p: 64 });
    const { execute, attempts } = scripted([
      {
        ok: true,
        result: outcome({
          derivedPlaceMaxes: [{ max: 10, meanRunMax: 8 }],
          metricRanges: [{ min: 20, max: 40, below: 0, above: 0 }],
        }),
      },
    ]);

    const probed = await probeDerivedCapacities({
      session: current,
      runCount: 10_000,
      windowInputs: [{ initialCount: 30, countCeiling: null }],
      placeCounts: [3],
      execute,
    });

    expect(attempts).toEqual([
      expect.objectContaining({ runCount: 128, preview: false }),
    ]);
    expect(current.capacities).toEqual(new Map([["p", 19]]));
    expect(current.shader.stateWordsPerRun).toBe(4 + 19 * 2);
    // 21 counts observed, margin ceil(21 × 0.25) = 6 → [14, 46] over 64 bins.
    expect(probed).toEqual({ ok: true, windows: [{ lo: 14, stride: 1 }] });
  });
});

describe("rememberCalibration", () => {
  const key = "marking|m0";

  it("lets the latest writer win when no slab shrinks", () => {
    const calibrations = new Map<string, GpuCalibration>();
    rememberCalibration(calibrations, key, session({ p: 10 }), [
      { lo: 0, stride: 1 },
    ]);
    rememberCalibration(calibrations, key, session({ p: 10 }), [
      { lo: 5, stride: 2 },
    ]);

    expect(calibrations.get(key)?.windows).toEqual([{ lo: 5, stride: 2 }]);
  });

  it("keeps an entry whose slabs are larger than the late writer's", () => {
    const calibrations = new Map<string, GpuCalibration>();
    rememberCalibration(calibrations, key, session({ p: 40 }), [
      { lo: 0, stride: 1 },
    ]);
    rememberCalibration(calibrations, key, session({ p: 10 }), [
      { lo: 5, stride: 2 },
    ]);

    expect(calibrations.get(key)?.capacities.get("p")).toBe(40);
    expect(calibrations.get(key)?.windows).toEqual([{ lo: 0, stride: 1 }]);
  });
});
