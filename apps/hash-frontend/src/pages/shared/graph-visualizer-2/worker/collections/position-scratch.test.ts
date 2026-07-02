import { describe, expect, it } from "vitest";

import { PositionScratch } from "./position-scratch";

describe("PositionScratch", () => {
  it("stores and reads back coordinates by index", () => {
    const scratch = new PositionScratch<number>();
    scratch.reset(8);

    scratch.set(0, 1.5, -2.5);
    scratch.set(7, 100, 200);

    expect(scratch.has(0)).toBe(true);
    expect(scratch.x(0)).toBe(1.5);
    expect(scratch.y(0)).toBe(-2.5);
    expect(scratch.has(7)).toBe(true);
    expect(scratch.x(7)).toBe(100);
    expect(scratch.y(7)).toBe(200);
  });

  it("reports unset and out-of-range slots as absent", () => {
    const scratch = new PositionScratch<number>();
    scratch.reset(4);

    expect(scratch.has(2)).toBe(false);
    // Beyond the reset capacity, including beyond the backing buffer.
    expect(scratch.has(4)).toBe(false);
    expect(scratch.has(1000)).toBe(false);
  });

  it("treats (0, 0) as a real position, not an empty slot", () => {
    const scratch = new PositionScratch<number>();
    scratch.reset(2);

    scratch.set(1, 0, 0);

    expect(scratch.has(1)).toBe(true);
    expect(scratch.x(1)).toBe(0);
    expect(scratch.y(1)).toBe(0);
  });

  it("reset clears previous entries while reusing capacity", () => {
    const scratch = new PositionScratch<number>();
    scratch.reset(4);
    scratch.set(3, 9, 9);

    scratch.reset(4);

    expect(scratch.has(3)).toBe(false);
  });

  it("reset with a larger capacity grows without losing set/get semantics", () => {
    const scratch = new PositionScratch<number>();
    scratch.reset(2);
    scratch.set(1, 5, 6);

    scratch.reset(16);

    expect(scratch.has(1)).toBe(false);
    scratch.set(15, -1, -2);
    expect(scratch.x(15)).toBe(-1);
    expect(scratch.y(15)).toBe(-2);
  });

  it("shrinking reset keeps larger indices absent even though the buffer is bigger", () => {
    const scratch = new PositionScratch<number>();
    scratch.reset(16);
    scratch.set(10, 1, 2);

    scratch.reset(4);

    // Index 10 is outside the active range now; stale data must not leak.
    expect(scratch.has(10)).toBe(false);
  });
});
