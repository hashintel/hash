import { describe, expect, expectTypeOf, it } from "vitest";

import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

/** A structurally distinct error selected by an instanceof guard. */
class LowLevelError extends Error {
  readonly level = "low";
}

/** A tagged context error with a message-derived reason. */
class HighLevelError extends Error {
  readonly _tag = "HighLevelError";
  readonly reason: string;

  /** Retains the detail of a replaced error. */
  constructor(reason: string) {
    super(`high level: ${reason}`);
    this.reason = reason;
  }
}

/** A replacement without additional domain fields. */
class Wrapped extends Error {}

/** The first tagged error alternative. */
class AError extends TaggedError.TaggedError<"AError", { readonly code: 1 }> {
  /** Supplies the first discriminant and code. */
  constructor() {
    super("AError", { code: 1 }, "a");
  }
}

/** The second tagged error alternative. */
class BError extends TaggedError.TaggedError<"BError", { readonly code: 2 }> {
  /** Supplies the second discriminant and code. */
  constructor() {
    super("BError", { code: 2 }, "b");
  }
}

/** The third tagged error alternative. */
class CError extends TaggedError.TaggedError<"CError", { readonly code: 3 }> {
  /** Supplies the third discriminant and code. */
  constructor() {
    super("CError", { code: 3 }, "c");
  }
}

/** The complete set from which tag guards select. */
type Tagged = AError | BError | CError;

/** An unknown-accepting class guard, as written for `instanceof` checks. */
const isLowLevelError = (error: unknown): error is LowLevelError =>
  error instanceof LowLevelError;

describe("changeContextIf refinement inference", () => {
  describe("unknown-accepting class guard", () => {
    const mixed: Result.Result<number, LowLevelError | "other"> = Result.err(
      new LowLevelError("low"),
    );

    it("data_first_exact_union", () => {
      const result = Result.changeContextIf(
        mixed,
        isLowLevelError,
        (cause) => new HighLevelError(cause.message),
      );

      expectTypeOf(result).toEqualTypeOf<
        Result.Result<number, HighLevelError | "other">
      >();
      expect(Result.isErr(result)).toBe(true);
      if (Result.isErr(result)) {
        expect(result.error).toBeInstanceOf(HighLevelError);
      }
    });

    it("curried_in_pipe_exact_union", () => {
      const result = mixed.pipe(
        Result.changeContextIf(
          isLowLevelError,
          (cause) => new HighLevelError(cause.message),
        ),
      );

      expectTypeOf(result).toEqualTypeOf<
        Result.Result<number, HighLevelError | "other">
      >();
      expect(Result.isErr(result)).toBe(true);
    });

    it("curried_source_type_not_widened_by_guard_parameter", () => {
      // The guard accepts unknown. The source error type must still come from
      // the piped result, never from the guard's parameter.
      const result = mixed.pipe(
        Result.changeContextIf(isLowLevelError, () => new Wrapped()),
      );

      expectTypeOf(result).not.toEqualTypeOf<Result.Result<number, unknown>>();
      expectTypeOf(result).toEqualTypeOf<
        Result.Result<number, Wrapped | "other">
      >();
    });
  });

  describe("generic tag guard", () => {
    const tagged: Result.Result<string, Tagged> = Result.err(new AError());

    it("positive_data_first", () => {
      const result = Result.changeContextIf(
        tagged,
        TaggedError.is("AError"),
        (error) => {
          // The matched error is the exact tagged variant, not never.
          expectTypeOf(error).toEqualTypeOf<AError>();
          expectTypeOf(error.reason.code).toEqualTypeOf<1>();
          return new Wrapped(String(error.reason.code));
        },
      );

      expectTypeOf(result).toEqualTypeOf<
        Result.Result<string, BError | CError | Wrapped>
      >();
      expect(Result.isErr(result)).toBe(true);
      if (Result.isErr(result)) {
        expect(result.error).toBeInstanceOf(Wrapped);
        expect(result.error.cause).toBeInstanceOf(AError);
      }
    });

    it("positive_curried_in_pipe", () => {
      const result = tagged.pipe(
        Result.changeContextIf(TaggedError.is("AError"), (error) => {
          expectTypeOf(error).toEqualTypeOf<AError>();
          return new Wrapped();
        }),
      );

      expectTypeOf(result).toEqualTypeOf<
        Result.Result<string, BError | CError | Wrapped>
      >();
    });

    it("negative_data_first", () => {
      const result = Result.changeContextIf(
        tagged,
        TaggedError.isNot("CError"),
        (error) => {
          expectTypeOf(error).toEqualTypeOf<AError | BError>();
          return new Wrapped();
        },
      );

      expectTypeOf(result).toEqualTypeOf<
        Result.Result<string, CError | Wrapped>
      >();
      expect(result).toMatchObject({ _tag: "err" });
    });

    it("negative_curried_in_pipe", () => {
      const result = tagged.pipe(
        Result.changeContextIf(
          TaggedError.isNot("CError"),
          () => new Wrapped(),
        ),
      );

      expectTypeOf(result).toEqualTypeOf<
        Result.Result<string, CError | Wrapped>
      >();
    });

    it("positive_then_negative_pipe_collapses_to_context_type", () => {
      const result = tagged.pipe(
        Result.changeContextIf(
          TaggedError.is("AError"),
          (error) => new HighLevelError(String(error.reason.code)),
        ),
        Result.changeContextIf(
          TaggedError.isNot("HighLevelError"),
          () => new HighLevelError("decode"),
        ),
      );

      expectTypeOf(result).toEqualTypeOf<
        Result.Result<string, HighLevelError>
      >();
      expect(Result.isErr(result)).toBe(true);
      if (Result.isErr(result)) {
        expect(result.error.reason).toBe("1");
      }
    });

    it("guard_for_absent_tag_matches_nothing", () => {
      const onlyB: Result.Result<number, BError> = Result.err(new BError());
      const result = Result.changeContextIf(
        onlyB,
        TaggedError.is("AError"),
        () => new Wrapped(),
      );

      // The refinement is never; the context factory cannot run, and its
      // type is still added to the union. Sound, and less precise than possible.
      expectTypeOf(result).toEqualTypeOf<
        Result.Result<number, BError | Wrapped>
      >();
      expect(result).toMatchObject({ _tag: "err", error: { _tag: "BError" } });
    });
  });

  describe("success type", () => {
    it("unchanged_in_both_forms", () => {
      const okResult: Result.Result<{ readonly id: number }, Tagged> =
        Result.ok({ id: 1 });

      const dataFirst = Result.changeContextIf(
        okResult,
        TaggedError.is("AError"),
        () => new Wrapped(),
      );
      const curried = okResult.pipe(
        Result.changeContextIf(TaggedError.is("BError"), () => new Wrapped()),
      );

      expectTypeOf(dataFirst).toEqualTypeOf<
        Result.Result<{ readonly id: number }, BError | CError | Wrapped>
      >();
      expectTypeOf(curried).toEqualTypeOf<
        Result.Result<{ readonly id: number }, AError | CError | Wrapped>
      >();
      expect(dataFirst).toMatchObject({ _tag: "ok", value: { id: 1 } });
      expect(curried).toMatchObject({ _tag: "ok", value: { id: 1 } });
    });

    it("never_success_type_preserved", () => {
      const failed: Result.Result<never, AError | BError> = Result.err(
        new AError(),
      );
      const result = Result.changeContextIf(
        failed,
        TaggedError.is("AError"),
        () => new Wrapped(),
      );

      expectTypeOf(result).toEqualTypeOf<
        Result.Result<never, BError | Wrapped>
      >();
    });
  });

  describe("stored partial application", () => {
    it("explicit_source_type_stays_polymorphic_in_value", () => {
      const rewrap = Result.changeContextIf<
        LowLevelError | "other",
        LowLevelError,
        HighLevelError
      >(isLowLevelError, (cause) => new HighLevelError(cause.message));

      expectTypeOf(rewrap).toEqualTypeOf<
        <T>(
          result: Result.Result<T, LowLevelError | "other">,
        ) => Result.Result<T, HighLevelError | "other">
      >();

      const asNumber: Result.Result<number, LowLevelError | "other"> =
        Result.err("other");
      const asString: Result.Result<string, LowLevelError | "other"> =
        Result.ok("fine");
      expectTypeOf(rewrap(asNumber)).toEqualTypeOf<
        Result.Result<number, HighLevelError | "other">
      >();
      expectTypeOf(rewrap(asString)).toEqualTypeOf<
        Result.Result<string, HighLevelError | "other">
      >();
      expect(rewrap(asNumber)).toMatchObject({ _tag: "err", error: "other" });
    });

    it("without_source_type_falls_back_to_unknown", () => {
      // Documented limitation: nothing supplies the source error type here.
      const rewrap = Result.changeContextIf(
        isLowLevelError,
        (cause) => new HighLevelError(cause.message),
      );

      expectTypeOf(rewrap).toEqualTypeOf<
        <T>(result: Result.Result<T, unknown>) => Result.Result<T, unknown>
      >();
    });
  });

  describe("two-sided guard requirement", () => {
    const notAGuard = (error: unknown): boolean =>
      error instanceof LowLevelError;
    const mixed: Result.Result<number, LowLevelError | HighLevelError> =
      Result.err(new LowLevelError("low"));

    it("boolean_predicate_rejected_in_both_forms", () => {
      // @ts-expect-error a boolean-returning function is not a type predicate.
      Result.changeContextIf(mixed, notAGuard, () => new Wrapped());

      mixed.pipe(
        // @ts-expect-error a boolean-returning function is not a type predicate.
        Result.changeContextIf(notAGuard, () => new Wrapped()),
      );
    });

    it("refinement_outside_source_union_rejected", () => {
      const onlyHigh: Result.Result<number, HighLevelError> = Result.err(
        new HighLevelError("x"),
      );

      // @ts-expect-error LowLevelError is not a member of the source error type.
      Result.changeContextIf(onlyHigh, isLowLevelError, () => new Wrapped());
    });
  });
});
