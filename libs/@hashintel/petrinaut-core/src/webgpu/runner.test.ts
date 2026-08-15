import { afterEach, describe, expect, it } from "vitest";

import {
  deriveGpuRunSeed,
  describeAllocationFailure,
  describeBufferOverflow,
  fillSeedChunk,
  requestGpuDevice,
  seedRunsPerChunk,
} from "./runner";

/**
 * The user-facing wall on run count. A device made without `requiredLimits` gets
 * the WebGPU defaults — 128 MiB per binding, 256 MiB per buffer — which is the
 * floor every implementation must support, not the hardware's capability. An
 * Apple metal-3 adapter reports 4096 MiB for both.
 */
describe("describeBufferOverflow", () => {
  const DEFAULT_LIMITS = {
    maxStorageBufferBindingSize: 128 * 1024 * 1024,
    maxBufferSize: 256 * 1024 * 1024,
  };
  const ADAPTER_LIMITS = {
    maxStorageBufferBindingSize: 4096 * 1024 * 1024,
    maxBufferSize: 4096 * 1024 * 1024,
  };

  const overflowFor = (
    limits: typeof DEFAULT_LIMITS,
    { bytesPerRun = 1024, runCount = 304_000 } = {},
  ) =>
    describeBufferOverflow({
      stateBytes: bytesPerRun * runCount,
      histBytes: 1024,
      bytesPerRun,
      runCount,
      limits,
    });

  it("refuses on the default limits and fits on the adapter's", () => {
    // ~311 MB of run state: over the 128 MiB default, far under 4096 MiB.
    expect(overflowFor(DEFAULT_LIMITS)).toMatch(/Run state needs 311 MB/);
    expect(overflowFor(ADAPTER_LIMITS)).toBeNull();
  });

  it("takes the smaller of the two limits, not just the binding size", () => {
    // Checking only `maxStorageBufferBindingSize` would pass this, and the
    // allocation would then fail as a raw WebGPU validation error instead.
    const cappedAllocation = {
      maxStorageBufferBindingSize: 4096 * 1024 * 1024,
      maxBufferSize: 256 * 1024 * 1024,
    };

    expect(overflowFor(cappedAllocation)).toMatch(/caps a buffer at 268 MB/);
  });

  it("says how many runs would fit instead of `use fewer runs`", () => {
    const reason = overflowFor(DEFAULT_LIMITS, {
      bytesPerRun: 1024,
      runCount: 304_000,
    });

    // floor(134217728 / 1024) = 131072.
    expect(reason).toMatch(
      /that is 131072 runs; this experiment asked for 304000/,
    );
  });

  it("reports the histogram separately, since fewer runs would not help", () => {
    expect(
      describeBufferOverflow({
        stateBytes: 1024,
        histBytes: 300 * 1e6,
        bytesPerRun: 1024,
        runCount: 1,
        limits: DEFAULT_LIMITS,
      }),
    ).toMatch(/Metric histograms need 300 MB/);
  });

  it("does not divide by zero when a run holds no state", () => {
    expect(
      describeBufferOverflow({
        stateBytes: 300 * 1e6,
        histBytes: 0,
        bytesPerRun: 0,
        runCount: 1,
        limits: DEFAULT_LIMITS,
      }),
    ).toMatch(/that is 0 runs/);
  });
});

describe("requestGpuDevice", () => {
  const original = Reflect.getOwnPropertyDescriptor(globalThis, "navigator");

  afterEach(() => {
    if (original) {
      Object.defineProperty(globalThis, "navigator", original);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
  });

  /** Records what the caller asked for, and honours it the way a real device does. */
  function stubAdapter(adapterLimits: Record<string, number>) {
    const requested: GPUDeviceDescriptor[] = [];
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        gpu: {
          requestAdapter: () =>
            Promise.resolve({
              info: { vendor: "apple", architecture: "metal-3" },
              limits: adapterLimits,
              requestDevice: (descriptor: GPUDeviceDescriptor = {}) => {
                requested.push(descriptor);
                return Promise.resolve({
                  limits: {
                    // A device gets the WebGPU defaults for anything it does not
                    // ask for, regardless of what the adapter supports.
                    maxStorageBufferBindingSize: 128 * 1024 * 1024,
                    maxBufferSize: 256 * 1024 * 1024,
                    ...descriptor.requiredLimits,
                  },
                });
              },
            }),
        },
      },
    });
    return requested;
  }

  it("asks for the adapter's limits, not the WebGPU defaults", async () => {
    // Without `requiredLimits` the device is capped at 128 MiB per binding on
    // hardware that offers 4096 MiB — a factor of 32 — and run counts the GPU
    // could hold were refused. Requesting exactly what the adapter reports is
    // always valid; only asking for more is rejected.
    const requested = stubAdapter({
      maxStorageBufferBindingSize: 4096 * 1024 * 1024,
      maxBufferSize: 4096 * 1024 * 1024,
    });

    const result = await requestGpuDevice();

    expect(requested[0]?.requiredLimits).toStrictEqual({
      maxStorageBufferBindingSize: 4096 * 1024 * 1024,
      maxBufferSize: 4096 * 1024 * 1024,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handle.device.limits.maxStorageBufferBindingSize).toBe(
      4096 * 1024 * 1024,
    );
  });

  it("does not ask for more than the adapter reports, which would be rejected", async () => {
    // A modest adapter must still get a device: requesting a hard-coded ceiling
    // would make `requestDevice` reject and lose the GPU entirely.
    const requested = stubAdapter({
      maxStorageBufferBindingSize: 128 * 1024 * 1024,
      maxBufferSize: 256 * 1024 * 1024,
    });

    const result = await requestGpuDevice();

    expect(requested[0]?.requiredLimits).toStrictEqual({
      maxStorageBufferBindingSize: 128 * 1024 * 1024,
      maxBufferSize: 256 * 1024 * 1024,
    });
    expect(result.ok).toBe(true);
  });
});

/**
 * Seeding used to build the whole run state as one `Uint32Array`. At ~2 KB per
 * run a million runs is ~2 GiB in one contiguous ArrayBuffer, which the browser
 * refuses outright — "Array buffer allocation failed", before frame zero. It is
 * staged in chunks now, which puts an absolute-vs-relative run index in the
 * middle of the hot path.
 */
describe("fillSeedChunk", () => {
  const LAYOUT = {
    stateWordsPerRun: 8,
    placeCountOffsets: [0, 1],
    rngOffset: 3,
    placeCounts: [5, 7],
    seed: 12345,
  };

  /** Seeds `runCount` runs through the chunked path, returning the whole buffer. */
  function seedChunked(runCount: number, runsPerChunk: number): Uint32Array {
    const whole = new Uint32Array(runCount * LAYOUT.stateWordsPerRun);
    const staging = new Uint32Array(runsPerChunk * LAYOUT.stateWordsPerRun);
    for (let firstRun = 0; firstRun < runCount; firstRun += runsPerChunk) {
      const runsInChunk = Math.min(runsPerChunk, runCount - firstRun);
      fillSeedChunk(staging, { ...LAYOUT, firstRun, runsInChunk });
      whole.set(
        staging.subarray(0, runsInChunk * LAYOUT.stateWordsPerRun),
        firstRun * LAYOUT.stateWordsPerRun,
      );
    }
    return whole;
  }

  it("produces the same bytes whatever the chunk size", () => {
    // Including a chunk size that does not divide the run count, and one run
    // per chunk — the degenerate case a very large per-run state produces.
    const reference = seedChunked(10, 10);

    for (const runsPerChunk of [1, 2, 3, 4, 7, 9, 10]) {
      expect(seedChunked(10, runsPerChunk)).toStrictEqual(reference);
    }
  });

  it("seeds each run from its absolute index, not its index within the chunk", () => {
    // The bug chunking invites: run 7 in chunk 2 getting run 1's stream, which
    // would silently correlate runs that must be independent.
    const state = seedChunked(10, 3);

    for (let run = 0; run < 10; run++) {
      expect(state[run * LAYOUT.stateWordsPerRun + LAYOUT.rngOffset]).toBe(
        deriveGpuRunSeed(LAYOUT.seed, run),
      );
    }
  });

  it("leaves every word it does not set as zero, which is what the shader expects", () => {
    // The staging array is reused across chunks. That is safe only because every
    // word this writes is written for every run at the same offsets, so nothing
    // from a previous chunk can survive inside the uploaded region. Asserting
    // the invariant directly rather than the `fill` that guards it: removing the
    // `fill` is genuinely unobservable today, and a test claiming otherwise
    // would be vacuous.
    const staging = new Uint32Array(4 * LAYOUT.stateWordsPerRun);
    fillSeedChunk(staging, { ...LAYOUT, firstRun: 0, runsInChunk: 4 });
    fillSeedChunk(staging, { ...LAYOUT, firstRun: 4, runsInChunk: 1 });

    const written = new Set([...LAYOUT.placeCountOffsets, LAYOUT.rngOffset]);
    for (let word = 0; word < LAYOUT.stateWordsPerRun; word++) {
      if (!written.has(word)) {
        expect(staging[word]).toBe(0);
      }
    }
    // And the one run in the short chunk is entirely its own.
    expect(staging[LAYOUT.rngOffset]).toBe(deriveGpuRunSeed(LAYOUT.seed, 4));
    expect(staging[0]).toBe(5);
    expect(staging[1]).toBe(7);
  });

  it("writes place counts at the offsets the shader reads them from", () => {
    const state = seedChunked(2, 1);

    expect(state[0]).toBe(5);
    expect(state[1]).toBe(7);
    expect(state[LAYOUT.stateWordsPerRun + 0]).toBe(5);
    expect(state[LAYOUT.stateWordsPerRun + 1]).toBe(7);
  });
});

describe("seedRunsPerChunk", () => {
  it("stages at least one run however large a single run's state is", () => {
    // A 4 MiB budget over a run needing more than that must not round to zero,
    // which would loop forever.
    expect(seedRunsPerChunk(50_000_000, 10)).toBe(1);
  });

  it("never stages more runs than exist", () => {
    expect(seedRunsPerChunk(8, 3)).toBe(3);
  });

  it("keeps the staging array bounded for a realistic net", () => {
    // 2088 bytes per run = 522 words; the staging array stays a few MiB rather
    // than scaling with the run count.
    const runsPerChunk = seedRunsPerChunk(522, 1_000_000);

    expect(runsPerChunk * 522 * 4).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(runsPerChunk).toBeGreaterThan(1000);
  });
});

/**
 * Dawn reports an out-of-memory `createBuffer` by returning an error buffer
 * rather than throwing, so allocation looks successful and the first thing the
 * user sees is `mapAsync` failing with "[Invalid Buffer] is invalid due to a
 * previous error" — three operations downstream, after the whole simulation has
 * run. The real message lives only inside an error scope.
 */
describe("describeAllocationFailure", () => {
  const DAWN_OOM =
    "Failed to allocate memory for buffer mapping\n    at APICreateErrorBuffer (../../third_party/dawn/src/dawn/native/Device.cpp:1573)\n";

  it("leads with the run arithmetic, not Dawn's internals", () => {
    const reason = describeAllocationFailure({
      message: DAWN_OOM,
      stateBytes: 3112 * 1_000_000,
      bytesPerRun: 3112,
      runCount: 1_000_000,
    });

    // Measured: 3112 B/run x 1e6 runs = 2.90 GiB, which fails to allocate as a
    // mappable buffer on an adapter reporting maxBufferSize = 4 GiB.
    expect(reason).toMatch(
      /^The GPU could not allocate memory for 1000000 runs/,
    );
    expect(reason).toContain("3112 bytes per run");
    expect(reason).toContain("2.90 GiB");
    // The two things the author can actually change.
    expect(reason).toMatch(/fewer runs/);
    expect(reason).toMatch(/token capacities/);
  });

  it("keeps the underlying message, which separates OOM from a validation bug", () => {
    const reason = describeAllocationFailure({
      message: DAWN_OOM,
      stateBytes: 1,
      bytesPerRun: 1,
      runCount: 1,
    });

    expect(reason).toContain("Failed to allocate memory for buffer mapping");
  });
});
