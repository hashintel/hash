import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { flow } from "./Function";
import * as Result from "./Result";

describe("Result.filter", () => {
  it("success_identity", () => {
    const column = { length: 3, at: (index: number) => index };
    const input = Result.ok(column);
    const onFalse = vi.fn(() => "wrong count" as const);
    const result = input.pipe(
      Result.filter((value: typeof column) => value.length === 3, onFalse),
    );
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<typeof column, "wrong count">
    >();
    expect(result).toBe(input);
    expect(onFalse).not.toHaveBeenCalled();
  });

  it("curried_predicate_preserves_column_type", () => {
    const column = { length: 3, at: (index: number) => index };
    const input: Result.Result<typeof column, "decode"> = Result.ok(column);
    const countMatches = Result.filter(
      (value: { readonly length: number }) => value.length === 3,
      () => "count" as const,
    );
    const result = input.pipe(countMatches);
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<typeof column, "decode" | "count">
    >();
    expect(result).toBe(input);
  });

  it("failure_identity", () => {
    const input: Result.Result<number, "decode"> = Result.err("decode");
    const predicate = vi.fn((value: number) => value > 0);
    const onFalse = vi.fn(() => "invalid" as const);
    const result = Result.filter(input, predicate, onFalse);
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<number, "decode" | "invalid">
    >();
    expect(result).toBe(input);
    expect(predicate).not.toHaveBeenCalled();
    expect(onFalse).not.toHaveBeenCalled();
  });

  it("predicate_rejection", () => {
    const onFalse = vi.fn((value: number) => ({ value }));
    expect(
      Result.filter(Result.ok(-1), (value) => value > 0, onFalse),
    ).toMatchObject({ _tag: "err", error: { value: -1 } });
    expect(onFalse).toHaveBeenCalledExactlyOnceWith(-1);
  });

  it("refinement_types", () => {
    const input: Result.Result<string | number, "source"> = Result.ok(3);
    const isString = (value: string | number): value is string =>
      typeof value === "string";
    const onFalse = () => "not string" as const;
    expectTypeOf(Result.filter(input, isString, onFalse)).toEqualTypeOf<
      Result.Result<string, "source" | "not string">
    >();
    expectTypeOf(input.pipe(Result.filter(isString, onFalse))).toEqualTypeOf<
      Result.Result<string, "source" | "not string">
    >();
  });

  it("predicate_exception", () => {
    const error = new Error("predicate failed");
    expect(() =>
      Result.filter(
        Result.ok(1),
        () => {
          throw error;
        },
        () => "invalid",
      ),
    ).toThrow(error);
  });

  it("factory_exception", () => {
    const error = new Error("factory failed");
    expect(() =>
      Result.filter(
        Result.ok(1),
        () => false,
        () => {
          throw error;
        },
      ),
    ).toThrow(error);
  });
});

describe("Result.assert", () => {
  it("success_lazy_error", () => {
    const onFalse = vi.fn(() => new Error("invalid"));
    expect(Result.assert(true, onFalse)).toMatchObject({
      _tag: "ok",
      value: undefined,
    });
    expect(onFalse).not.toHaveBeenCalled();
  });

  it("failure_call_forms", () => {
    const error = new Error("invalid");
    expect(Result.assert(false, () => error)).toMatchObject({
      _tag: "err",
      error,
    });
    expect(Result.assert(() => error)(false)).toMatchObject({
      _tag: "err",
      error,
    });
  });

  it("generator_short_circuit", () => {
    const after = vi.fn();
    const result = Result.gen(function* validate() {
      yield* Result.assert(false, () => "invalid" as const);
      after();
      return 42;
    });
    expectTypeOf(result).toEqualTypeOf<Result.Result<number, "invalid">>();
    expect(result).toMatchObject({ _tag: "err", error: "invalid" });
    expect(after).not.toHaveBeenCalled();
  });
});

describe("Result.fromNullable", () => {
  it.each([null, undefined])("absence_%s", (value) => {
    expect(Result.fromNullable(value, () => "missing")).toMatchObject({
      _tag: "err",
      error: "missing",
    });
  });
  it.each([false, 0, ""])("present_%s", (value) => {
    const onNull = vi.fn(() => "missing");
    expect(Result.fromNullable(onNull)(value)).toMatchObject({
      _tag: "ok",
      value,
    });
    expect(onNull).not.toHaveBeenCalled();
  });
});

describe("flow", () => {
  it("ordered_composition", () => {
    const parse = flow(
      (left: number, right: number) => left + right,
      (value) => String(value),
      (text) => text.length,
    );
    expectTypeOf(parse).toEqualTypeOf<
      (left: number, right: number) => number
    >();
    expect(parse(12, 3)).toBe(2);
  });
  it("exception_short_circuit", () => {
    const after = vi.fn();
    const error = new Error("first failed");
    const parse = flow(() => {
      throw error;
    }, after);
    expect(() => parse()).toThrow(error);
    expect(after).not.toHaveBeenCalled();
  });
});
