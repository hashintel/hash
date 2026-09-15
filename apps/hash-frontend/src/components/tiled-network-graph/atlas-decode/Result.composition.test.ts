import { describe, expect, expectTypeOf, it } from "vitest";

import * as Result from "./Result";

describe("Result.all", () => {
  it("tuple_types", () => {
    const values = Result.all([Result.ok(12), Result.ok("ready")]);
    expectTypeOf(values).toEqualTypeOf<
      Result.Result<[number, string], never>
    >();
    expect(values).toMatchObject({ _tag: "ok", value: [12, "ready"] });
  });

  it("array_types", () => {
    const items: readonly Result.Result<number, "failed">[] = [
      Result.ok(1),
      Result.ok(2),
    ];
    const values = Result.all(items);
    expectTypeOf(values).toEqualTypeOf<Result.Result<number[], "failed">>();
    expect(values).toMatchObject({ _tag: "ok", value: [1, 2] });
  });

  it("empty_tuple", () => {
    const values = Result.all([]);
    expectTypeOf(values).toEqualTypeOf<Result.Result<[], never>>();
    expect(values).toMatchObject({ _tag: "ok", value: [] });
  });

  it("first_error", () => {
    const first = new Error("first");
    const second = new Error("second");
    const values = Result.all([
      Result.ok(1),
      Result.err(first),
      Result.err(second),
    ]);
    expect(values._tag).toBe("err");
    if (Result.isErr(values)) {
      expect(values.error).toBe(first);
    }
  });

  it("error_union", () => {
    const left: Result.Result<number, "left"> = Result.err("left");
    const right: Result.Result<string, "right"> = Result.err("right");
    expectTypeOf(Result.all([left, right])).toEqualTypeOf<
      Result.Result<[number, string], "left" | "right">
    >();
  });
});

describe("Result.fn", () => {
  it("fresh_invocations", () => {
    const seen: number[] = [];
    const increment = Result.fn(function* increment(value: number) {
      seen.push(value);
      return (yield* Result.ok(value)) + 1;
    });
    expect(seen).toEqual([]);
    expect(increment(1)).toMatchObject({ _tag: "ok", value: 2 });
    expect(increment(2)).toMatchObject({ _tag: "ok", value: 3 });
    expect(seen).toEqual([1, 2]);
  });

  it("generic_arguments", () => {
    const identity = Result.fn(function* identity<T>(value: T) {
      return yield* Result.ok(value);
    });
    expectTypeOf(identity("text")).toEqualTypeOf<Result.Result<string>>();
    expectTypeOf(identity(1)).toEqualTypeOf<Result.Result<number>>();
    expect(identity("text")).toMatchObject({ _tag: "ok", value: "text" });
  });

  it("failed_step", () => {
    let continued = false;
    const fail = Result.fn(function* fail() {
      yield* Result.err("failed");
      continued = true;
      return 1;
    });
    expect(fail()).toMatchObject({ _tag: "err", error: "failed" });
    expect(continued).toBe(false);
  });

  it("failed_cleanup", () => {
    const trace: string[] = [];
    const result = Result.gen(function* nestedCleanup() {
      try {
        yield* Result.err("original");
      } finally {
        try {
          yield* Result.err("cleanup");
          trace.push("resumed");
        } finally {
          trace.push("closed");
        }
      }
    });
    expect(result).toMatchObject({ _tag: "err", error: "original" });
    expect(trace).toEqual(["closed"]);
  });
});
