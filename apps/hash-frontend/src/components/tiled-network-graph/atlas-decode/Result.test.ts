import { describe, expect, expectTypeOf, it } from "vitest";

import * as Result from "./Result";

class LowLevelError extends Error {}

class HighLevelError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`high level: ${reason}`);
    this.reason = reason;
  }
}

describe("Result equality in tests", () => {
  it("distinguishes different Err values", () => {
    expect(Result.err("boom")).toEqual(Result.err("boom"));
    expect(Result.err("boom")).not.toEqual(Result.err("other"));
    expect(Result.ok(1)).not.toEqual(Result.err(1));
  });
});

describe("Result.gen", () => {
  it("unwraps Ok values and wraps the return value", () => {
    const result = Result.gen(function* () {
      const left = yield* Result.ok(1);
      const right = yield* Result.ok(2);
      return left + right;
    });

    expect(result).toEqual(Result.ok(3));
    expectTypeOf(result).toEqualTypeOf<Result.Result<number, never>>();
  });

  it("short-circuits on the first Err", () => {
    let reachedAfterErr = false;

    const result = Result.gen(function* () {
      const value = yield* Result.ok(1);
      const missing = yield* Result.err("boom") as Result.Result<
        number,
        string
      >;
      reachedAfterErr = true;
      return value + missing;
    });

    expect(result).toEqual(Result.err("boom"));
    expect(reachedAfterErr).toBe(false);
  });

  it("collects the error types of every unwrapped Result", () => {
    const first: Result.Result<number, "a"> = Result.ok(1);
    const second: Result.Result<string, "b"> = Result.ok("two");

    const result = Result.gen(function* () {
      const one = yield* first;
      const two = yield* second;
      return `${one}${two}`;
    });

    expectTypeOf(result).toEqualTypeOf<Result.Result<string, "a" | "b">>();
    expect(result).toEqual(Result.ok("1two"));
  });

  it("accepts an explicit gen.Return annotation on the body", () => {
    const first: Result.Result<number, "a"> = Result.ok(1);
    const second: Result.Result<string, "b"> = Result.ok("two");

    const result = Result.gen(function* (): Result.gen.Return<
      string,
      "a" | "b"
    > {
      const one = yield* first;
      const two = yield* second;
      return `${one}${two}`;
    });

    expectTypeOf(result).toEqualTypeOf<Result.Result<string, "a" | "b">>();
    expect(result).toEqual(Result.ok("1two"));
  });

  it("runs finally blocks when short-circuiting", () => {
    let cleanedUp = false;
    const failing: Result.Result<number, string> = Result.err("boom");

    const result = Result.gen(function* () {
      try {
        return yield* failing;
      } finally {
        cleanedUp = true;
      }
    });

    expect(result).toEqual(Result.err("boom"));
    expect(cleanedUp).toBe(true);
  });
});

describe("Result.catch", () => {
  it("returned_variants", () => {
    const outcomes = [Result.ok(7), Result.err("ordinary failure")];
    for (const outcome of outcomes) {
      let handled = false;
      const actual = Result.catch(
        () => outcome,
        () => {
          handled = true;
          return Result.ok(0);
        },
      );
      expect(actual).toBe(outcome);
      expect(handled).toBe(false);
    }
  });

  it.each([
    { name: "error", cause: new Error("thrown") },
    { name: "undefined", cause: undefined },
    { name: "object", cause: { code: "thrown" } },
  ])("exception_$name", ({ cause }) => {
    const error = new HighLevelError("caught");
    let calls = 0;
    const result = Result.catch(
      () => {
        calls += 1;
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- JavaScript can throw values that are not Error objects.
        throw cause;
      },
      (received) => {
        expect(received).toBe(cause);
        error.cause = received;
        return Result.err(error);
      },
    );
    expect(calls).toBe(1);
    expect(result).toMatchObject({ _tag: "err", error });
    expect(error.cause).toBe(cause);
  });

  it("curried_recovery", () => {
    const recover = Result.catch(() => Result.ok("fallback"));
    let calls = 0;
    const result = recover(() => {
      calls += 1;
      throw new Error("failed");
    });
    expect(result).toMatchObject({ _tag: "ok", value: "fallback" });
    expect(calls).toBe(1);
  });

  it("value_and_error_unions", () => {
    const body = (): Result.Result<number, "parse"> => Result.ok(1);
    const handler = (): Result.Result<string, "recover"> =>
      Result.ok("fallback");
    const direct = Result.catch(body, handler);
    const curried = Result.catch(handler)(body);
    expectTypeOf(direct).toEqualTypeOf<
      Result.Result<number | string, "parse" | "recover">
    >();
    expectTypeOf(curried).toEqualTypeOf<typeof direct>();
  });

  it("handler_exception", () => {
    const error = new Error("handler failed");
    expect(() =>
      Result.catch(
        () => {
          throw new Error("body failed");
        },
        () => {
          throw error;
        },
      ),
    ).toThrow(error);
  });

  it("generator_cleanup_exception", () => {
    const cause = new Error("cleanup failed");
    const result = Result.catch(
      () =>
        Result.gen(function* cleanupFailure() {
          try {
            return yield* Result.err("original");
          } finally {
            throw cause;
          }
        }),
      (received) => Result.err(new HighLevelError(String(received))),
    );
    expect(result).toMatchObject({
      _tag: "err",
      error: { message: "high level: Error: cleanup failed" },
    });
  });
});

describe("dual functions", () => {
  const okResult: Result.Result<number, LowLevelError> = Result.ok(2);
  const lowLevelError = new LowLevelError("low");
  const errResult: Result.Result<number, LowLevelError> =
    Result.err(lowLevelError);

  it("map works data-first and data-last", () => {
    expect(Result.map(okResult, (value) => value * 2)).toEqual(Result.ok(4));
    expect(Result.map((value: number) => value * 2)(okResult)).toEqual(
      Result.ok(4),
    );
    expect(Result.map(errResult, (value) => value * 2)).toEqual(errResult);
  });

  it("andThen unions the error types", () => {
    const result = Result.andThen(okResult, (value) =>
      value > 1 ? Result.err("too big" as const) : Result.ok(value),
    );

    expectTypeOf(result).toEqualTypeOf<
      Result.Result<number, LowLevelError | "too big">
    >();
    expect(result).toEqual(Result.err("too big"));
  });

  it("match works data-first and data-last", () => {
    const handlers = {
      onOk: (value: number) => `ok:${value}`,
      onErr: (error: LowLevelError) => `err:${error.message}`,
    };

    expect(Result.match(okResult, handlers)).toBe("ok:2");
    expect(Result.match(handlers)(errResult)).toBe("err:low");
  });

  it("changeContext wraps the error and records the cause", () => {
    const result = Result.changeContext(
      errResult,
      () => new HighLevelError("decode"),
    );

    expectTypeOf(result).toEqualTypeOf<Result.Result<number, HighLevelError>>();
    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error).toBeInstanceOf(HighLevelError);
      expect(result.error.cause).toBe(lowLevelError);
    }

    expect(
      Result.changeContext(okResult, () => new HighLevelError("x")),
    ).toEqual(okResult);
  });
});

describe("changeContextIf", () => {
  const isLowLevelError = (error: unknown): error is LowLevelError =>
    error instanceof LowLevelError;

  const lowLevel: Result.Result<number, LowLevelError | HighLevelError> =
    Result.err(new LowLevelError("low"));
  const highLevel: Result.Result<number, LowLevelError | HighLevelError> =
    Result.err(new HighLevelError("already high"));

  it("wraps errors matched by the refinement", () => {
    const result = Result.changeContextIf(
      lowLevel,
      isLowLevelError,
      (cause) => new HighLevelError(cause.message),
    );

    expectTypeOf(result).toEqualTypeOf<Result.Result<number, HighLevelError>>();
    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error.reason).toBe("low");
      expect(result.error.cause).toBeInstanceOf(LowLevelError);
    }
  });

  it("leaves errors that are already the target type untouched", () => {
    const result = Result.changeContextIf(
      highLevel,
      isLowLevelError,
      () => new HighLevelError("rewrapped"),
    );

    expect(result).toEqual(highLevel);
    if (Result.isErr(result)) {
      expect(result.error.cause).toBeUndefined();
    }
  });

  it("infers the source error type from the piped Result in data-last form", () => {
    const result = lowLevel.pipe(
      Result.changeContextIf(
        isLowLevelError,
        (cause) => new HighLevelError(cause.message),
      ),
    );

    expectTypeOf(result).toEqualTypeOf<Result.Result<number, HighLevelError>>();
    expect(Result.isErr(result)).toBe(true);
  });

  it("keeps unmatched error types in the union", () => {
    const mixed: Result.Result<number, LowLevelError | "other"> =
      Result.err("other");

    const result = mixed.pipe(
      Result.changeContextIf(isLowLevelError, () => new HighLevelError("x")),
    );

    expectTypeOf(result).toEqualTypeOf<
      Result.Result<number, HighLevelError | "other">
    >();
    expect(result).toEqual(Result.err("other"));
  });

  it("passes Ok values through", () => {
    expect(
      Result.changeContextIf(
        Result.ok(1) as Result.Result<number, LowLevelError>,
        isLowLevelError,
        () => new HighLevelError("x"),
      ),
    ).toEqual(Result.ok(1));
  });
});

describe("Result#pipe", () => {
  it("threads a Result through data-last functions", () => {
    const decoded: Result.Result<number, LowLevelError> = Result.err(
      new LowLevelError("low"),
    );

    const result = decoded.pipe(
      Result.map((value) => value + 1),
      Result.changeContext((error) => new HighLevelError(error.message)),
    );

    expectTypeOf(result).toEqualTypeOf<Result.Result<number, HighLevelError>>();
    expect(Result.isErr(result)).toBe(true);
    if (Result.isErr(result)) {
      expect(result.error.reason).toBe("low");
      expect(result.error.cause).toBeInstanceOf(LowLevelError);
    }
  });

  it("composes with gen", () => {
    const readByte = (): Result.Result<number, LowLevelError> => Result.ok(7);

    const message = Result.gen(function* () {
      const first = yield* readByte();
      const second = yield* readByte();
      return first + second;
    }).pipe(
      Result.changeContext(() => new HighLevelError("envelope")),
      Result.match({
        onOk: (sum) => `sum=${sum}`,
        onErr: (error) => error.message,
      }),
    );

    expectTypeOf(message).toEqualTypeOf<string>();
    expect(message).toBe("sum=14");
  });

  it("with no arguments returns the result itself", () => {
    const result = Result.ok(1);
    expect(result.pipe()).toBe(result);
  });
});
