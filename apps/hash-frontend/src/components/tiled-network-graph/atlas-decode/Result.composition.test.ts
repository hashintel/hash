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
    expectTypeOf(values).toEqualTypeOf<
      Result.Result<number[], Result.All<"failed">>
    >();
    expect(values).toMatchObject({ _tag: "ok", value: [1, 2] });
  });

  it("empty_tuple", () => {
    const values = Result.all([]);
    expectTypeOf(values).toEqualTypeOf<Result.Result<[], never>>();
    expect(values).toMatchObject({ _tag: "ok", value: [] });
  });

  it("all_errors_in_input_order", () => {
    const first = new Error("first");
    const second = new Error("second");
    const values = Result.all([
      Result.ok(1),
      Result.err(first),
      Result.ok(2),
      Result.err(second),
      Result.err(first),
    ]);
    expect(values._tag).toBe("err");
    if (Result.isErr(values)) {
      expect(values.error).toBeInstanceOf(Result.All);
      expect(values.error).toBeInstanceOf(AggregateError);
      expect(values.error.errors).toHaveLength(3);
      expect(values.error.errors[0]).toBe(first);
      expect(values.error.errors[1]).toBe(second);
      expect(values.error.errors[2]).toBe(first);
    }
  });

  it("single_error_is_aggregated", () => {
    const result = Result.all([Result.ok(1), Result.err(undefined)]);
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<[number, never], Result.All<undefined>>
    >();
    expect(result).toMatchObject({
      _tag: "err",
      error: { errors: [undefined] },
    });
    if (Result.isErr(result)) {
      expect(result.error).toBeInstanceOf(Result.All);
    }
  });

  it("aggregate_members_are_not_flattened", () => {
    const inner = new Result.All(["first", "second"]);
    const result = Result.all([Result.err(inner)]);
    expect(result._tag).toBe("err");
    if (Result.isErr(result)) {
      expect(result.error.errors).toHaveLength(1);
      expect(result.error.errors[0]).toBe(inner);
    }
  });

  it("error_union", () => {
    const left: Result.Result<number, "left"> = Result.err("left");
    const right: Result.Result<string, "right"> = Result.err("right");
    const result = Result.all([left, right]);
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<[number, string], Result.All<"left" | "right">>
    >();
    expect(result).toMatchObject({
      _tag: "err",
      error: { errors: ["left", "right"] },
    });
  });

  it("context_retains_the_aggregate", () => {
    const first = new Error("first");
    const second = new Error("second");
    const combined = Result.all([Result.err(first), Result.err(second)]);
    const context = new Error("invalid document");
    const result = combined.pipe(Result.changeContext(() => context));
    expect(result).toMatchObject({ _tag: "err", error: context });
    if (Result.isErr(combined)) {
      expect(context.cause).toBe(combined.error);
      expect(combined.error.errors[0]).toBe(first);
      expect(combined.error.errors[1]).toBe(second);
    }
  });

  it("inputs_are_already_evaluated", () => {
    const evaluated: number[] = [];
    const compute = (index: number) => {
      evaluated.push(index);
      return Result.err(index);
    };
    const result = Result.all([compute(0), compute(1), compute(2)]);
    expect(evaluated).toEqual([0, 1, 2]);
    expect(result).toMatchObject({ _tag: "err", error: { errors: [0, 1, 2] } });
  });
});

describe("Result.All", () => {
  it("copies_the_collection_but_preserves_members", () => {
    const member = new Error("member");
    const errors = [member];
    const aggregate = new Result.All(errors);
    expectTypeOf(aggregate.errors).toEqualTypeOf<Error[]>();
    errors.length = 0;
    expect(aggregate.errors).toHaveLength(1);
    expect(aggregate.errors[0]).toBe(member);
    expect(aggregate.name).toBe("All");
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
