// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { mulberry32, parkMillerRng } from "./random";

const draw = (next: () => number, count: number) =>
  Array.from({ length: count }, () => next());

describe("mulberry32", () => {
  it("reproduces the same sequence for the same seed", () => {
    expect(draw(mulberry32(12345), 8)).toEqual(draw(mulberry32(12345), 8));
  });

  it("returns values in [0, 1)", () => {
    const next = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("diverges for different seeds", () => {
    expect(draw(mulberry32(1), 4)).not.toEqual(draw(mulberry32(2), 4));
  });
});

describe("parkMillerRng", () => {
  it("reproduces the same sequence for the same seed", () => {
    expect(draw(parkMillerRng(42), 8)).toEqual(draw(parkMillerRng(42), 8));
  });

  it("returns values in (0, 1)", () => {
    const next = parkMillerRng(99);
    for (let i = 0; i < 1000; i++) {
      const value = next();
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
  });
});
