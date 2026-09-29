import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { flow, pipe, spread } from "./function";
import * as Iterable from "./iterable";

describe("Function", () => {
  it("pipe_value_only", () => {
    expect(pipe(3)).toBe(3);
  });

  it("pipe_left_to_right", () => {
    const result = pipe(
      3,
      (value) => value + 1,
      (value) => `${value}`,
      (text) => text.length,
    );
    expectTypeOf(result).toEqualTypeOf<number>();
    expect(result).toBe(1);
  });

  it("pipe_const_tuple", () => {
    const result = pipe([1, "a"], (tuple) => tuple);
    expectTypeOf(result).toEqualTypeOf<readonly [1, "a"]>();
  });

  it("pipe_step_exception", () => {
    const error = new Error("step failed");
    const after = vi.fn();
    expect(() =>
      pipe(
        1,
        () => {
          throw error;
        },
        after,
      ),
    ).toThrow(error);
    expect(after).not.toHaveBeenCalled();
  });

  it("spread_tuple", () => {
    const add = (left: number, right: number) => left + right;
    expectTypeOf(spread(add)).toEqualTypeOf<
      (args: [left: number, right: number]) => number
    >();
    expect(spread(add)([2, 3])).toBe(5);
  });

  it("spread_generic_retains_positions", () => {
    const zipped = spread(Iterable.zip)([
      [1, 2],
      ["a", "b"],
    ] as const);
    expectTypeOf(zipped).toEqualTypeOf<Iterable<[1 | 2, "a" | "b"]>>();
    expect([...zipped]).toEqual([
      [1, "a"],
      [2, "b"],
    ]);
  });

  it("pipe_spread_zip_pipeline", () => {
    const sources = [1, 2, 3];
    const trailer = undefined as { labels: string[] } | undefined;
    const result = pipe(
      [sources, trailer?.labels ?? Iterable.repeat(null)],
      spread(Iterable.zip),
      Iterable.map(([source, label]) => ({ source, label })),
      Iterable.collect(),
    );
    expectTypeOf(result).toEqualTypeOf<
      { source: number; label: string | null }[]
    >();
    expect(result).toEqual([
      { source: 1, label: null },
      { source: 2, label: null },
      { source: 3, label: null },
    ]);
  });

  it("flow_pipe_agree", () => {
    const composed = flow(
      (value: number) => value + 1,
      (value) => value * 2,
    );
    expect(composed(3)).toBe(
      pipe(
        3,
        (value) => value + 1,
        (value) => value * 2,
      ),
    );
  });
});
