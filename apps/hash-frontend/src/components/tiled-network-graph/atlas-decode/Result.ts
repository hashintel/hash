/**
 * Behaviour shared by {@link Ok} and {@link Err}.
 *
 * Both variants carry the full `<T, E>` pair even though each only stores one
 * of them. This mirrors Effect's `Success<A, E> | Failure<A, E>` and is what
 * lets `pipe` be called on a `Result<T, E>` union: TypeScript can only invoke
 * an overloaded generic method on a union when every member has an identical
 * signature.
 */
abstract class ResultBase<out T, out E> {
  /**
   * `yield* result` inside {@link gen} evaluates to `T` for an `Ok` and
   * short-circuits the surrounding generator for an `Err`.
   */
  abstract [Symbol.iterator](): Generator<Err<T, E>, T, unknown>;

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

export class Ok<out T, out E> extends ResultBase<T, E> {
  readonly _tag = "ok";

  readonly value: T;

  constructor(value: T) {
    super();
    this.value = value;
  }

  // eslint-disable-next-line require-yield -- an Ok never suspends; the generator exists so that `yield*` evaluates to the value.
  *[Symbol.iterator](): Generator<never, T, unknown> {
    return this.value;
  }
}

export class Err<out T, out E> extends ResultBase<T, E> {
  readonly _tag = "err";

  readonly error: E;

  constructor(error: E) {
    super();
    this.error = error;
  }

  *[Symbol.iterator](): Generator<Err<T, E>, never, unknown> {
    yield this;

    // `gen` never resumes an `Err`, so this is only reached by generic
    // consumers that drain the iterable (spread, deep-equality matchers, …).
    // Completing quietly keeps those working; the `never` return type is
    // honest for `gen`, which is the only consumer that reads the result.
    return undefined as never;
  }
}

export type Result<T, E = never> = Ok<T, E> | Err<T, E>;

export const ok = <T>(value: T): Result<T> => new Ok(value);

export const err = <E>(error: E): Result<never, E> => new Err(error);

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T, E> =>
  result._tag === "ok";

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

/**
 * Rejects parameter lists whose length is not statically known (rest or
 * optional parameters), since {@link dual} reads the arity off the
 * implementation at runtime and needs it to match the type exactly.
 */
type FixedArity<Args extends readonly unknown[]> = number extends Args["length"]
  ? never
  : Args extends Required<Args>
    ? Args
    : never;

type DataFirst<Signature extends DualSignature> = (
  ...args: FixedArity<Parameters<Signature>>
) => ReturnType<Signature>;

/**
 * Make a function callable both data-first and data-last, decided by how many
 * arguments the call site passes.
 *
 * The overloaded type is taken from the annotation of the binding being
 * assigned; the implementation only has to be written data-first. Its arity
 * is read from `body.length`, which is why {@link FixedArity} forbids rest,
 * optional, and defaulted parameters in the implementation.
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
 * The thunk runs once. An ordinary returned {@link Err} remains unchanged. A thrown value is passed to the handler, which may return either variant. Exceptions thrown by the handler propagate to its caller.
 *
 * Both `Result.catch(body, handler)` and `Result.catch(handler)(body)` are supported. Pass the computation as a thunk so that evaluation occurs inside the exception handler.
 *
 * @example
 * ```ts
 * const parsed = Result.catch(
 *   () => Result.ok(JSON.parse("{")),
 *   (cause) => Result.err(new Error("invalid JSON", { cause })),
 * );
 * // parsed is Err; parsed.error.cause is the JSON SyntaxError.
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

export const map: {
  <T, U>(func: (value: T) => U): <E>(result: Result<T, E>) => Result<U, E>;
  <T, E, U>(result: Result<T, E>, func: (value: T) => U): Result<U, E>;
} = dual(
  2,
  <T, E, U>(result: Result<T, E>, func: (value: T) => U): Result<U, E> =>
    isOk(result) ? ok(func(result.value)) : err(result.error),
);

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
 * Replace the error with a higher-level one, keeping the original reachable
 * as its `cause`.
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
 * Like {@link changeContext}, but only for errors matched by `refinement`;
 * anything else passes through untouched. Use it to lift low-level errors
 * into a higher-level one without re-wrapping errors that are already at
 * that level.
 *
 * ```ts
 * // Result<Envelope, DecoderError | EnvelopeError>
 * //   -> Result<Envelope, EnvelopeError>
 * result.pipe(
 *   Result.changeContextIf(isDecoderError, () => new EnvelopeError("truncated")),
 * );
 * ```
 *
 * In the data-last form the source error type comes from the `Result` being
 * piped in, not from the refinement's parameter (hence `NoInfer`), so a broad
 * guard such as `(error: unknown) => error is DecoderError` narrows correctly.
 */
export const changeContextIf: {
  <E1, E2 extends E1, E3 extends Error>(
    refinement: (error: NoInfer<E1>) => error is E2,
    context: (error: E2) => E3,
  ): <T>(result: Result<T, E1>) => Result<T, Exclude<E1, E2> | E3>;
  <T, E1, E2 extends E1, E3 extends Error>(
    result: Result<T, E1>,
    refinement: (error: NoInfer<E1>) => error is E2,
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

type ErrorOf<Y> = Y extends Err<unknown, infer E> ? E : never;

/**
 * Run a generator that unwraps `Result`s with `yield*`, short-circuiting on
 * the first `Err`.
 *
 * ```ts
 * const decoded = Result.gen(function* (): Result.gen.Return<Envelope, EnvelopeError> {
 *   const kind = yield* decodeKind(decoder);
 *   const version = yield* decodeVersion(decoder);
 *   return { kind, version };
 * });
 * ```
 *
 * When the body is left unannotated, the error type of the returned `Result`
 * is inferred as the union of every error type unwrapped in the body.
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

// A type-only namespace merges with the `gen` value above, giving
// `Result.gen.Return<T, E>` as the annotation for a generator body.
// eslint-disable-next-line @typescript-eslint/no-namespace, import/export -- see above.
export declare namespace gen {
  /**
   * Return type of a generator body passed to {@link gen}: it may `yield*`
   * any `Result<_, E>` and must return a `T`.
   */
  type Return<T, E = never> = Generator<Err<unknown, E>, T, unknown>;
}
