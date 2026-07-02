/**
 * Column tests, focused on the windowed-scratch API (`resize`/`fill`/`clear`)
 * and the backing choice — the contracts the render-side packers lean on.
 */
import { describe, expect, it } from "vitest";

import { Column } from "./column";

describe("Column windowed-scratch API", () => {
  it("resize grows the window and preserves earlier contents across growth", () => {
    const column = new Column(Int32Array, 4);
    column.resize(4);
    column.fill(7);

    // Force a capacity grow: contents written before must survive.
    column.resize(64);
    expect(column.length).toBe(64);
    expect(column.capacity).toBeGreaterThanOrEqual(64);
    expect(column.get(0)).toBe(7);
    expect(column.get(3)).toBe(7);
  });

  it("clear keeps capacity and buffer identity (allocation-free reuse)", () => {
    const column = new Column(Float32Array, 8);
    column.resize(8);
    const bufferBefore = column.buffer;
    const capacityBefore = column.capacity;

    column.clear();
    expect(column.length).toBe(0);

    column.resize(8);
    expect(column.buffer).toBe(bufferBefore);
    expect(column.capacity).toBe(capacityBefore);
  });

  it("resize after clear re-exposes previous contents (documented persistence)", () => {
    const column = new Column(Int32Array, 4);
    column.resize(2);
    column.set(0, 41);
    column.set(1, 42);

    column.clear();
    column.resize(2);

    // Stamp-plane style usage depends on this: no implicit zeroing.
    expect(column.get(0)).toBe(41);
    expect(column.get(1)).toBe(42);
  });

  it("fill writes only the requested sub-range of the window", () => {
    const column = new Column(Int32Array, 8);
    column.resize(4);
    column.fill(0);
    column.fill(9, 1, 3);

    expect([...column.subarray()]).toEqual([0, 9, 9, 0]);
  });

  it("plain backing yields ArrayBuffer views even where SharedArrayBuffer exists", () => {
    const plain = new Column(Float32Array, 4, { backing: "plain" });
    expect(plain.buffer).toBeInstanceOf(ArrayBuffer);

    // Growth must stay plain too (GPU upload paths see the grown buffer).
    plain.resize(4096);
    expect(plain.buffer).toBeInstanceOf(ArrayBuffer);
  });
});
