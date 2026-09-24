import { describe, expect, expectTypeOf, it, vi } from "vitest";

import * as Iterable from "./iterable";

describe("Iterable", () => {
  it("zip_acquisition_failure", () => {
    const cause = new Error("acquisition failed");
    const close = vi.fn(() => ({ done: true, value: undefined }) as const);
    const first: Iterable<number> = {
      [Symbol.iterator]: () => ({
        next: () => ({ done: false, value: 1 }),
        return: close,
      }),
    };
    const second: Iterable<number> = {
      [Symbol.iterator]: () => {
        throw cause;
      },
    };
    expect(() => [...Iterable.zip(first, second)]).toThrow(cause);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("zip_cleanup_failures", () => {
    const firstCause = new Error("first close failed");
    const thirdCause = new Error("third close failed");
    const closeFirst = vi.fn(() => {
      throw firstCause;
    });
    const closeThird = vi.fn(() => {
      throw thirdCause;
    });
    const source = (close: () => never): Iterable<number> => ({
      [Symbol.iterator]: () => ({
        next: () => ({ done: false, value: 1 }),
        return: close,
      }),
    });
    let failure: unknown;
    try {
      Array.from(Iterable.zip(source(closeFirst), [], source(closeThird)));
    } catch (error) {
      failure = error;
    }
    expect(closeFirst).toHaveBeenCalledTimes(1);
    expect(closeThird).toHaveBeenCalledTimes(1);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) {
      throw new Error("expected cleanup failures");
    }
    expect(failure.errors).toHaveLength(2);
    expect(failure.errors[0]).toBe(firstCause);
    expect(failure.errors[1]).toBe(thirdCause);
  });

  it("zip_iteration_and_cleanup_failures", () => {
    const iteration = new Error("iteration failed");
    const cleanup = new Error("cleanup failed");
    const closeOther = vi.fn(() => ({ done: true, value: undefined }) as const);
    const first: Iterable<number> = {
      [Symbol.iterator]: () => ({
        next: () => {
          throw iteration;
        },
        return: () => {
          throw cleanup;
        },
      }),
    };
    const second: Iterable<number> = {
      [Symbol.iterator]: () => ({
        next: () => ({ done: false, value: 2 }),
        return: closeOther,
      }),
    };
    let failure: unknown;
    try {
      Array.from(Iterable.zip(first, second));
    } catch (error) {
      failure = error;
    }
    expect(closeOther).toHaveBeenCalledTimes(1);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) {
      throw new Error("expected iteration and cleanup failures");
    }
    expect(failure.errors).toHaveLength(2);
    expect(failure.errors[0]).toBe(iteration);
    expect(failure.errors[1]).toBe(cleanup);
  });

  it("map_call_forms", () => {
    const length = (text: string) => text.length;
    expect([...Iterable.map(["a", "bb"], length)]).toEqual([1, 2]);
    expect([...Iterable.map(length)(["a", "bb"])]).toEqual([1, 2]);
    expectTypeOf(Iterable.map(["a", "bb"], length)).toEqualTypeOf<
      Iterable<number>
    >();
    expectTypeOf(Iterable.map(length)).toEqualTypeOf<
      (source: Iterable<string>) => Iterable<number>
    >();
  });

  it("map_index", () => {
    expect([
      ...Iterable.map(["a", "b"], (element, index) => `${index}${element}`),
    ]).toEqual(["0a", "1b"]);
  });

  it("map_lazy", () => {
    const transform = vi.fn((value: number) => value * 2);
    const mapped = Iterable.map(Iterable.repeat(1), transform);
    expect(transform).not.toHaveBeenCalled();
    const iterator = mapped[Symbol.iterator]();
    expect(iterator.next()).toEqual({ done: false, value: 2 });
    expect(transform).toHaveBeenCalledExactlyOnceWith(1, 0);
  });

  it("map_reiterable", () => {
    const mapped = Iterable.map([1, 2], (value) => value + 1);
    expect([...mapped]).toEqual([...mapped]);
  });

  it("map_callback_exception", () => {
    const error = new Error("callback failed");
    const mapped = Iterable.map([1], () => {
      throw error;
    });
    expect(() => [...mapped]).toThrow(error);
  });

  it("collect_array", () => {
    const collected = Iterable.collect(new Set([1, 2, 3]));
    expectTypeOf(collected).toEqualTypeOf<number[]>();
    expect(collected).toEqual([1, 2, 3]);
  });

  it("collect_call_forms", () => {
    const source = new Set([1, 2]);
    expect(Iterable.collect(source)).toEqual([1, 2]);
    expect(Iterable.collect()(source)).toEqual([1, 2]);
    expectTypeOf(Iterable.collect<number>()).toEqualTypeOf<
      (source: Iterable<number>) => number[]
    >();
  });

  it("collect_copies", () => {
    const source = [1, 2];
    const collected = Iterable.collect(source);
    expect(collected).toEqual(source);
    expect(collected).not.toBe(source);
  });

  it("collect_pipeline", () => {
    expect(
      Iterable.collect(
        Iterable.map(
          Iterable.zip([1, 2, 3], Iterable.repeat(10)),
          ([value, offset]) => value + offset,
        ),
      ),
    ).toEqual([11, 12, 13]);
  });

  it("repeat_infinite", () => {
    const value = { id: 1 };
    const iterator = Iterable.repeat(value)[Symbol.iterator]();
    expectTypeOf(Iterable.repeat(value)).toEqualTypeOf<
      Iterable<{ id: number }>
    >();
    for (let index = 0; index < 1000; index += 1) {
      expect(iterator.next()).toEqual({ done: false, value });
    }
  });

  it("repeat_count", () => {
    expect([...Iterable.repeat("x", 3)]).toEqual(["x", "x", "x"]);
    expect([...Iterable.repeat("x", 0)]).toEqual([]);
  });

  it("repeat_reiterable", () => {
    const repeated = Iterable.repeat(7, 2);
    expect([...repeated]).toEqual([...repeated]);
  });

  it("repeat_zip_constant", () => {
    expect([...Iterable.zip([1, 2, 3], Iterable.repeat("k"))]).toEqual([
      [1, "k"],
      [2, "k"],
      [3, "k"],
    ]);
  });

  it("zip_positional_tuples", () => {
    const zipped = Iterable.zip([1, 2, 3], ["a", "b", "c"]);
    expectTypeOf(zipped).toEqualTypeOf<Iterable<[number, string]>>();
    expect([...zipped]).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
  });

  it("zip_shortest_source", () => {
    expect([...Iterable.zip([1, 2, 3], ["a"], [true, false])]).toEqual([
      [1, "a", true],
    ]);
  });

  it("zip_no_sources", () => {
    expect([...Iterable.zip()]).toEqual([]);
  });

  it("zip_single_source", () => {
    expect([...Iterable.zip(new Set([1, 2]))]).toEqual([[1], [2]]);
  });

  it("zip_lazy", () => {
    const first = vi.fn(function* first() {
      yield 1;
      yield 2;
    });
    const zipped = Iterable.zip({ [Symbol.iterator]: first }, [1, 2]);
    expect(first).not.toHaveBeenCalled();
    expect([...zipped]).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("zip_reiterable", () => {
    const zipped = Iterable.zip([1, 2], ["a", "b"]);
    expect([...zipped]).toEqual([...zipped]);
  });

  it("zip_closes_remaining_on_exhaustion", () => {
    const cleanup = vi.fn();
    const infinite = function* infinite() {
      try {
        for (let index = 0; ; index += 1) {
          yield index;
        }
      } finally {
        cleanup();
      }
    };
    expect([...Iterable.zip(infinite(), [1, 2])]).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("zip_closes_all_on_early_break", () => {
    const cleanup = vi.fn();
    const counting = function* counting() {
      try {
        yield 1;
        yield 2;
      } finally {
        cleanup();
      }
    };
    const iterator = Iterable.zip(counting(), counting())[Symbol.iterator]();
    expect(iterator.next()).toEqual({ done: false, value: [1, 1] });
    iterator.return?.();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
