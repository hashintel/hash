/**
 * Synchronous computations with explicitly typed failures.
 *
 * A {@link Result} contains an already computed value or error. Use {@link gen} for dependent steps and {@link all} to assemble independent results. Operations execute immediately. Callback exceptions propagate unless the computation is enclosed by {@link catchResult | catch}.
 *
 * Promise values remain values, without being awaited.
 *
 * @module
 */

/** Sequential composition shared by {@link Ok} and {@link Err}. */
abstract class ResultBase<out T, out E> {
  // overloaded methods on a union need identical signatures. Both variants retain T and E for their shared pipe method.
  /**
   * Unwraps a success or yields a failure to {@link gen}.
   *
   * @throws {TypeError} If an {@link Err} iterator is resumed with `next` after yielding its error. A failed step has no success value to return.
   */
  abstract [Symbol.iterator](): Generator<Err<T, E>, T, unknown>;

  /**
   * Applies functions from left to right, starting with this result.
   *
   * A call without steps returns this instance. Up to six typed steps are supported, and the final step may return any type.
   *
   * @example
   * ```ts
   * const description = Result.ok(3).pipe(
   *   Result.map((value) => value * 2),
   *   Result.match({ onOk: (value) => String(value), onErr: () => "failed" }),
   * );
   * // description === "6"
   * ```
   */
  pipe(): Result<T, E>;

  pipe<A>(ab: (self: Result<T, E>) => A): A;

  pipe<A, B>(ab: (self: Result<T, E>) => A, bc: (a: A) => B): B;

  pipe<A, B, C>(
    ab: (self: Result<T, E>) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
  ): C;

  pipe<A, B, C, D>(
    ab: (self: Result<T, E>) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
  ): D;

  pipe<A, B, C, D, F>(
    ab: (self: Result<T, E>) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => F,
  ): F;

  pipe<A, B, C, D, F, G>(
    ab: (self: Result<T, E>) => A,
    bc: (a: A) => B,
    cd: (b: B) => C,
    de: (c: C) => D,
    ef: (d: D) => F,
    fg: (f: F) => G,
  ): G;

  pipe(...steps: ReadonlyArray<(input: never) => unknown>): unknown {
    // Each step's parameter type is fixed by the overloads above, which
    // guarantee it matches the previous step's output.
    return steps.reduce<unknown>(
      (current, step) => step(current as never),
      this,
    );
  }
}

/** A successful computation. Prefer {@link ok} for error-type inference. */
export class Ok<out T, out E> extends ResultBase<T, E> {
  readonly _tag = "ok";

  readonly value: T;

  /** Retains the supplied value without cloning it. */
  constructor(value: T) {
    super();
    this.value = value;
  }

  // eslint-disable-next-line require-yield -- an Ok never suspends. Delegation returns its value.
  *[Symbol.iterator](): Generator<never, T, unknown> {
    return this.value;
  }
}

/** A failed computation. The error may be any type. */
export class Err<out T, out E> extends ResultBase<T, E> {
  readonly _tag = "err";

  readonly error: E;

  /** Retains the supplied error without cloning it. */
  constructor(error: E) {
    super();
    this.error = error;
  }

  *[Symbol.iterator](): Generator<Err<T, E>, never, unknown> {
    yield this;

    throw new TypeError("cannot resume a failed Result", { cause: this.error });
  }
}

/** A success value or a failure, distinguished by `_tag`. The default error type is `never`. */
export type Result<T, E = never> = Ok<T, E> | Err<T, E>;

/** Constructs an {@link Ok} assignable to any error type. See {@link all} for tuple assembly. */
export const ok = <T>(value: T): Result<T> => new Ok(value);

/** Constructs an {@link Err} assignable to any success type. See {@link gen} for short-circuiting. */
export const err = <E>(error: E): Result<never, E> => new Err(error);

/** Narrows to a success, exposing its value. See {@link all} for an example. */
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T, E> =>
  result._tag === "ok";

/** Narrows to a failure, exposing its error. */
export const isErr = <T, E>(result: Result<T, E>): result is Err<T, E> =>
  result._tag === "err";

/**
 * An overloaded signature usable both data-last (`f(...args)(self)`) and
 * data-first (`f(self, ...args)`).
 *
 * The data-first overload must be declared last: `Parameters` and
 * `ReturnType` resolve overloaded types through their final signature, and
 * {@link dual} relies on that to type-check the implementation.
 */
type DualSignature = {
  (...args: never[]): (self: never) => unknown;
  (self: never, ...args: never[]): unknown;
};

/** A fixed-length parameter tuple, excluding rest and optional parameters. */
type FixedArity<Args extends readonly unknown[]> = number extends Args["length"]
  ? never
  : Args extends Required<Args>
    ? Args
    : never;

/** The implementation signature of a data-first call. */
type DataFirst<Signature extends DualSignature> = (
  ...args: FixedArity<Parameters<Signature>>
) => ReturnType<Signature>;

/**
 * Supports immediate application and partial application of one operation.
 *
 * The arity must equal the final overload's parameter count. Calls with one fewer argument return a function awaiting the first argument.
 *
 * @throws {TypeError} When the call has neither supported argument count.
 */
const dual = <Signature extends DualSignature>(
  arity: FixedArity<Parameters<Signature>>["length"],
  body: DataFirst<Signature>,
): Signature => {
  const call = body as (...args: unknown[]) => unknown;

  const dispatch = (...args: unknown[]): unknown => {
    if (args.length === arity) {
      return call(...args);
    }
    if (args.length === arity - 1) {
      return (self: unknown) => call(self, ...args);
    }
    throw new TypeError(
      `expected ${arity} or ${arity - 1} arguments, received ${args.length}`,
    );
  };

  // `dispatch` is deliberately untyped: the overloads in `Signature` are the
  // only description of which argument shapes are valid, and they cannot be
  // reconstructed from a runtime arity check.
  return dispatch as unknown as Signature;
};

/**
 * Runs a result-producing thunk and handles thrown exceptions.
 *
 * The thunk runs once. Its returned result is preserved unchanged. A thrown value is passed to the handler, which may fail or recover. Only synchronous exceptions are handled.
 *
 * @returns The body or handler result, with their combined value and error types.
 * @throws Any exception thrown by the handler.
 *
 * Both `Result.catch(body, handler)` and `Result.catch(handler)(body)` are supported. Pass the computation as a thunk so that evaluation occurs inside the exception handler.
 *
 * @example
 * ```ts
 * const parsed = Result.catch(
 *   () => Result.ok(JSON.parse("{")),
 *   (cause) => Result.err(new Error("invalid JSON", { cause })),
 * );
 * // Result.isErr(parsed) && parsed.error.cause instanceof SyntaxError
 * ```
 */
const catchResult: {
  <U, F>(
    handler: (cause: unknown) => Result<U, F>,
  ): <T, E>(body: () => Result<T, E>) => Result<T | U, E | F>;
  <T, E, U, F>(
    body: () => Result<T, E>,
    handler: (cause: unknown) => Result<U, F>,
  ): Result<T | U, E | F>;
} = dual(
  2,
  <T, E, U, F>(
    body: () => Result<T, E>,
    handler: (cause: unknown) => Result<U, F>,
  ): Result<T | U, E | F> => {
    try {
      return body();
    } catch (cause) {
      return handler(cause);
    }
  },
);

export { catchResult as catch };

/**
 * Resolves either result variant to a plain value.
 *
 * Exactly one handler runs. Both handlers have the same return type. Supply a union return type explicitly when the branches produce different types. See {@link ResultBase.pipe} for an example.
 */
export const match: {
  <T, E, R>(handlers: {
    onOk: (value: T) => R;
    onErr: (error: E) => R;
  }): (result: Result<T, E>) => R;
  <T, E, R>(
    result: Result<T, E>,
    handlers: { onOk: (value: T) => R; onErr: (error: E) => R },
  ): R;
} = dual(
  2,
  <T, E, R>(
    result: Result<T, E>,
    { onOk, onErr }: { onOk: (value: T) => R; onErr: (error: E) => R },
  ): R => (isOk(result) ? onOk(result.value) : onErr(result.error)),
);

/**
 * Transforms a success value while preserving a failure's error value.
 *
 * @returns The transformed success or the original error value. The callback runs only on success. See {@link ResultBase.pipe} for an example.
 */
export const map: {
  <T, U>(func: (value: T) => U): <E>(result: Result<T, E>) => Result<U, E>;
  <T, E, U>(result: Result<T, E>, func: (value: T) => U): Result<U, E>;
} = dual(
  2,
  <T, E, U>(result: Result<T, E>, func: (value: T) => U): Result<U, E> =>
    isOk(result) ? ok(func(result.value)) : err(result.error),
);

/**
 * Continues a successful computation with another fallible operation.
 *
 * @returns The callback result on success, or the original error value on failure. Either operation's error type may occur.
 *
 * @example
 * ```ts
 * const positive = Result.andThen(Result.ok(-1), (value) =>
 *   value > 0 ? Result.ok(value) : Result.err("not positive"),
 * );
 * // Result.isErr(positive) && positive.error === "not positive"
 * ```
 */
export const andThen: {
  <T, U, E2>(
    func: (value: T) => Result<U, E2>,
  ): <E1>(result: Result<T, E1>) => Result<U, E1 | E2>;
  <T, E1, U, E2>(
    result: Result<T, E1>,
    func: (value: T) => Result<U, E2>,
  ): Result<U, E1 | E2>;
} = dual(
  2,
  <T, E1, U, E2>(
    result: Result<T, E1>,
    func: (value: T) => Result<U, E2>,
  ): Result<U, E1 | E2> =>
    isOk(result) ? func(result.value) : err(result.error),
);

/**
 * Replaces an error while retaining it as the new error's cause.
 *
 * The factory runs only on failure. Its returned error is used directly, and its `cause` is overwritten with the original error. See {@link changeContextIf} for conditional replacement.
 *
 * @returns The new error or the unchanged success value.
 * @throws If the factory throws or the returned error's cause cannot be assigned.
 */
export const changeContext: {
  <E1, E2 extends Error>(
    context: (error: E1) => E2,
  ): <T>(result: Result<T, E1>) => Result<T, E2>;
  <T, E1, E2 extends Error>(
    result: Result<T, E1>,
    context: (error: E1) => E2,
  ): Result<T, E2>;
} = dual(
  2,
  <T, E1, E2 extends Error>(
    result: Result<T, E1>,
    context: (error: E1) => E2,
  ): Result<T, E2> => {
    if (isOk(result)) {
      return ok(result.value);
    }

    const next = context(result.error);
    next.cause = result.error;

    return err(next);
  },
);

/**
 * Replaces selected error variants while preserving other error values.
 *
 * The refinement is a two-sided type guard: false must exclude its entire target type. Use discriminated error variants, rather than message predicates or structurally indistinguishable classes. Matched errors follow {@link changeContext}.
 *
 * The data-last form infers the source error type inside {@link ResultBase.pipe}. A separately stored partial application needs an explicit source type to retain that precision.
 *
 * @returns The replacement error, an unmatched error value, or the unchanged success value.
 * @throws If the refinement or error replacement throws.
 */
export const changeContextIf: {
  <E1, E2 extends E1, E3 extends Error>(
    refinement: (error: E1) => error is E2,
    context: (error: E2) => E3,
  ): <T>(result: Result<T, E1>) => Result<T, Exclude<E1, E2> | E3>;
  <T, E1, E2 extends E1, E3 extends Error>(
    result: Result<T, E1>,
    refinement: (error: E1) => error is E2,
    context: (error: E2) => E3,
  ): Result<T, Exclude<E1, E2> | E3>;
} = dual(
  3,
  <T, E1, E2 extends E1, E3 extends Error>(
    result: Result<T, E1>,
    refinement: (error: E1) => error is E2,
    context: (error: E2) => E3,
  ): Result<T, Exclude<E1, E2> | E3> => {
    if (isOk(result)) {
      return ok(result.value);
    }

    if (!refinement(result.error)) {
      return err(result.error as Exclude<E1, E2>);
    }

    const next = context(result.error);
    next.cause = result.error;

    return err(next);
  },
);

/** The error carried by a yielded failure. */
type ErrorOf<Y> = Y extends Err<unknown, infer E> ? E : never;

/** The success value carried by either variant's complete type parameters. */
type ValueOf<Item> = Item extends Result<infer Value, unknown> ? Value : never;

/** The error type carried by either variant's complete type parameters. */
type FailureOf<Item> =
  Item extends Result<unknown, infer Failure> ? Failure : never;

/** The success values of a result tuple, in its input order. */
type Values<Items extends readonly Result<unknown, unknown>[]> = {
  -readonly [Index in keyof Items]: ValueOf<Items[Index]>;
};

/**
 * Assembles successful results into a tuple or array in input order.
 *
 * @returns The values, or the first {@link Err} error value in input order. An empty input succeeds with an empty tuple. Inputs are already evaluated results: this function does not schedule or short-circuit their computation.
 *
 * @example
 * ```ts
 * const pair = Result.all([Result.ok(12), Result.ok("ready")]);
 * // Result.isOk(pair) && pair.value[0] === 12 && pair.value[1] === "ready"
 * ```
 */
export const all = <const Items extends readonly Result<unknown, unknown>[]>(
  items: Items,
): Result<Values<Items>, FailureOf<Items[number]>> => {
  const values: unknown[] = [];

  for (const item of items) {
    if (isErr(item)) {
      return err(item.error as FailureOf<Items[number]>);
    }

    values.push(item.value);
  }

  // every input succeeded, with one value appended at its corresponding tuple position.
  return ok(values as Values<Items>);
};

/**
 * Runs dependent fallible steps, stopping at the first error.
 *
 * Inside the body, `yield*` unwraps a {@link Result}. A success supplies its value and a failure skips the remaining steps. The body's return value becomes an {@link Ok}, including a nested result if one is returned directly.
 *
 * Closing a failed computation executes enclosing `finally` blocks. A failed step in cleanup is also closed. Cleanup return values and returned errors do not replace the first error, but thrown exceptions propagate.
 *
 * @returns The body's value or its first yielded error. Error types are inferred from the yielded results, or fixed by a {@link gen.Return} annotation.
 * @throws Any exception from the body or its cleanup. Use {@link catchResult | catch} around the computation to handle it.
 *
 * @example
 * ```ts
 * const sum = Result.gen(function* sum() {
 *   const first = yield* Result.ok(2);
 *   const second = yield* Result.ok(3);
 *   return first + second;
 * });
 * // Result.isOk(sum) && sum.value === 5
 * ```
 */
// eslint-disable-next-line import/export -- merged with the type-only namespace below.
export const gen = <Y extends Err<unknown, unknown>, R>(
  body: () => Generator<Y, R, unknown>,
): Result<R, ErrorOf<Y>> => {
  const iterator = body();
  const step = iterator.next();

  if (step.done) {
    return ok(step.value);
  }

  // a failed yield in cleanup suspends again. Return again to close its enclosing finally blocks without resuming that failed step.
  let closed = iterator.return(undefined as never);
  while (!closed.done) {
    closed = iterator.return(undefined as never);
  }

  return err(step.value.error as ErrorOf<Y>);
};

/**
 * Defines a function whose body unwraps results with `yield*`.
 *
 * Each invocation runs a fresh generator with its supplied arguments. Execution and errors follow {@link gen}. Use this form for named operations, and {@link gen} for an immediate computation.
 *
 * @example
 * ```ts
 * const double = Result.fn(function* double(value: number) {
 *   return (yield* Result.ok(value)) * 2;
 * });
 * const doubled = double(6);
 * // Result.isOk(doubled) && doubled.value === 12
 * ```
 */
export const fn =
  <Args extends unknown[], Value, E>(
    body: (...args: Args) => gen.Return<Value, E>,
  ): ((...args: Args) => Result<Value, E>) =>
  (...args) =>
    gen(() => body(...args));

// A type-only namespace merges with the `gen` value above, giving
// `Result.gen.Return<T, E>` as the annotation for a generator body.
// eslint-disable-next-line @typescript-eslint/no-namespace, import/export -- see above.
export declare namespace gen {
  /** A generator body with success type T and permitted error type E. */
  type Return<T, E = never> = Generator<Err<unknown, E>, T, unknown>;
}
