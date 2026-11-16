import { describe, expect, it } from "vitest";

import { nextRandom, philox2x32 } from "./seeded-rng";

describe("philox2x32", () => {
  it("matches the Random123 known-answer vectors for Philox-2x32-10", () => {
    const hex = (words: [number, number]) =>
      words.map((word) => word.toString(16).padStart(8, "0"));

    expect(hex(philox2x32(0, 0, 0))).toEqual(["ff1dae59", "6cd10df2"]);
    expect(hex(philox2x32(0xffffffff, 0xffffffff, 0xffffffff))).toEqual([
      "2c3f628b",
      "ab4fd7ad",
    ]);
    expect(hex(philox2x32(0x243f6a88, 0x85a308d3, 0x13198a2e))).toEqual([
      "dd7ce038",
      "f62a4c12",
    ]);
  });
});

describe("nextRandom", () => {
  it("draws uniform values in [0, 1) from consecutive keys, uncorrelated between adjacent streams", () => {
    const streamCount = 64;
    const drawsPerStream = 1_000;
    const draws = streamCount * drawsPerStream;
    const values = Array.from({ length: streamCount }, (_, key) => {
      const stream = { key, counter: 0 };
      return Array.from({ length: drawsPerStream }, () => nextRandom(stream));
    });

    let sum = 0;
    let crossProducts = 0;
    for (const [key, streamValues] of values.entries()) {
      const next = values[(key + 1) % streamCount]!;
      for (const [index, value] of streamValues.entries()) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
        sum += value;
        crossProducts += (value - 0.5) * (next[index]! - 0.5);
      }
    }

    // Four standard errors: the mean of U(0, 1) has variance 1/12n, and the
    // covariance of independent ones has variance 1/144n.
    expect(Math.abs(sum / draws - 0.5)).toBeLessThan(
      4 * Math.sqrt(1 / 12 / draws),
    );
    expect(Math.abs(crossProducts / draws)).toBeLessThan(
      4 * Math.sqrt(1 / 144 / draws),
    );
  });
});
