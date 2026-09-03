import { describe, expect, it } from "vitest";

import { deriveGpuRunSeed, fillSeedChunk, seedRunsPerChunk } from "./seeds";

/**
 * Seeding is staged in chunks, which puts an absolute-vs-relative run index in
 * the middle of the hot path.
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
    // The staging array is reused across chunks; nothing from a previous chunk
    // may survive inside the uploaded region.
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

  it("writes a typed place's token words at its slot offset", () => {
    const staging = new Uint32Array(2 * 12);
    fillSeedChunk(staging, {
      firstRun: 0,
      runsInChunk: 2,
      stateWordsPerRun: 12,
      placeCountOffsets: [0, 1],
      placeTokenOffsets: [4, 4],
      rngOffset: 2,
      placeCounts: [0, 2],
      placeTokenWords: [new Uint32Array(0), Uint32Array.from([9, 8, 7, 6])],
      seed: 1,
    });

    expect([...staging.subarray(4, 8)]).toEqual([9, 8, 7, 6]);
    expect([...staging.subarray(16, 20)]).toEqual([9, 8, 7, 6]);
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
