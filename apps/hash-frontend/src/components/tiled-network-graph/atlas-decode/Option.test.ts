import { describe, expect, expectTypeOf, it, vi } from "vitest";

import * as Option from "./Option";
import * as Result from "./Result";

describe("Option", () => {
  it.each([null, undefined])("nullable_absence_%s", (value) => {
    expect(Option.fromNullable(value)).toEqual(Option.none());
  });

  it.each([0, false, "", new Uint8Array()])("nullable_present_%s", (value) => {
    const option = Option.fromNullable(value);
    expect(Option.isSome(option)).toBe(true);
    if (Option.isSome(option)) {
      expect(option.value).toBe(value);
    }
  });

  it("nullable_type", () => {
    const value: number | null = null as number | null;
    expectTypeOf(Option.fromNullable(value)).toEqualTypeOf<
      Option.Option<number>
    >();
  });

  it("map_call_forms", () => {
    const length = (text: string) => text.length;
    expect(Option.map(Option.some("abc"), length)).toEqual(Option.some(3));
    expect(Option.map(length)(Option.some("abc"))).toEqual(Option.some(3));
    expectTypeOf(Option.map(Option.some("abc"), length)).toEqualTypeOf<
      Option.Option<number>
    >();
  });

  it("map_absence", () => {
    const transform = vi.fn(() => 3);
    expect(Option.map(Option.none(), transform)).toBe(Option.none());
    expect(transform).not.toHaveBeenCalled();
  });

  it("filter_call_forms", () => {
    const isEven = (value: number) => value % 2 === 0;
    expect(Option.filter(Option.some(2), isEven)).toEqual(Option.some(2));
    expect(Option.filter(Option.some(3), isEven)).toEqual(Option.none());
    expect(Option.filter(isEven)(Option.some(4))).toEqual(Option.some(4));
    expectTypeOf(Option.filter(Option.some(2), isEven)).toEqualTypeOf<
      Option.Option<number>
    >();
  });

  it("filter_absence", () => {
    const predicate = vi.fn(() => true);
    expect(Option.filter(Option.none(), predicate)).toBe(Option.none());
    expect(predicate).not.toHaveBeenCalled();
  });

  it("filter_refinement_narrows", () => {
    const isString = (value: unknown): value is string =>
      typeof value === "string";
    const option = Option.some("abc") as Option.Option<string | number>;
    expectTypeOf(Option.filter(option, isString)).toEqualTypeOf<
      Option.Option<string>
    >();
    expectTypeOf(Option.filter(isString)(option)).toEqualTypeOf<
      Option.Option<string>
    >();
    expect(Option.filter(Option.some(1 as string | number), isString)).toEqual(
      Option.none(),
    );
  });

  it("lift_predicate_call_forms", () => {
    const isEven = (value: number) => value % 2 === 0;
    expect(Option.liftPredicate(2, isEven)).toEqual(Option.some(2));
    expect(Option.liftPredicate(3, isEven)).toEqual(Option.none());
    expect(Option.liftPredicate(isEven)(4)).toEqual(Option.some(4));
    const value: number = 2;
    expectTypeOf(Option.liftPredicate(value, isEven)).toEqualTypeOf<
      Option.Option<number>
    >();
    expectTypeOf(Option.liftPredicate(isEven)(value)).toEqualTypeOf<
      Option.Option<number>
    >();
  });

  it("lift_predicate_refinement_narrows", () => {
    const isString = (value: unknown): value is string =>
      typeof value === "string";
    const value = "abc" as string | number;
    expectTypeOf(Option.liftPredicate(value, isString)).toEqualTypeOf<
      Option.Option<string>
    >();
    expectTypeOf(Option.liftPredicate(isString)(value)).toEqualTypeOf<
      Option.Option<string>
    >();
    expect(Option.liftPredicate(1 as string | number, isString)).toEqual(
      Option.none(),
    );
  });

  it("match_selected_handler", () => {
    const onSome = vi.fn((value: number) => value + 1);
    const onNone = vi.fn(() => 0);
    expect(Option.match(Option.some(2), { onSome, onNone })).toBe(3);
    expect(onSome).toHaveBeenCalledExactlyOnceWith(2);
    expect(onNone).not.toHaveBeenCalled();
    expect(Option.match({ onSome, onNone })(Option.none())).toBe(0);
    expect(onNone).toHaveBeenCalledTimes(1);
    expect(onSome).toHaveBeenCalledTimes(1);
  });

  it("match_distinct_returns", () => {
    const handlers = {
      onSome: (value: number) => ({ value }),
      onNone: () => "absent" as const,
    };
    expectTypeOf(Option.match(Option.some(2), handlers)).toEqualTypeOf<
      { value: number } | "absent"
    >();
    expectTypeOf(Option.match(handlers)(Option.none())).toEqualTypeOf<
      { value: number } | "absent"
    >();
  });

  it("unwrap_or_else_call_forms", () => {
    const orElse = vi.fn(() => 0);
    expect(Option.unwrapOrElse(Option.some(2), orElse)).toBe(2);
    expect(Option.unwrapOrElse(orElse)(Option.some(3))).toBe(3);
    expect(orElse).not.toHaveBeenCalled();
  });

  it("unwrap_or_else_absence", () => {
    const orElse = vi.fn(() => 0);
    expect(Option.unwrapOrElse(Option.none(), orElse)).toBe(0);
    expect(orElse).toHaveBeenCalledTimes(1);
  });

  it("unwrap_or_else_distinct_types", () => {
    const option = Option.none() as Option.Option<number>;
    expectTypeOf(
      Option.unwrapOrElse(option, () => "absent" as const),
    ).toEqualTypeOf<number | "absent">();
    expectTypeOf(
      Option.unwrapOrElse(() => "absent" as const)(option),
    ).toEqualTypeOf<number | "absent">();
  });

  it("callback_exception", () => {
    const error = new Error("callback failed");
    expect(() =>
      Option.map(Option.some(1), () => {
        throw error;
      }),
    ).toThrow(error);
  });

  it("transpose_absence", () => {
    expect(Option.transposeResult(Option.none())).toMatchObject({
      _tag: "ok",
      value: Option.none(),
    });
  });

  it("transpose_success", () => {
    const value = new Uint8Array();
    const result = Option.transposeResult(Option.some(Result.ok(value)));
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<Option.Option<Uint8Array<ArrayBuffer>>, never>
    >();
    expect(result).toMatchObject({
      _tag: "ok",
      value: { _tag: "some", value },
    });
    if (Result.isOk(result) && Option.isSome(result.value)) {
      expect(result.value.value).toBe(value);
    }
  });

  it("transpose_failure", () => {
    const error = new Error("invalid mask");
    const result = Option.transposeResult(Option.some(Result.err(error)));
    expect(result._tag).toBe("err");
    if (Result.isErr(result)) {
      expect(result.error).toBe(error);
    }
  });
});
