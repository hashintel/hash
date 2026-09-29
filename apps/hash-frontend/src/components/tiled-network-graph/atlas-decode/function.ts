/** Data-last and data-first overloads, with the data-first signature declared last. */
type DualSignature = {
  (...args: never[]): (self: never) => unknown;
  (self: never, ...args: never[]): unknown;
};

type FixedArity<Args extends readonly unknown[]> = number extends Args["length"]
  ? never
  : Args extends Required<Args>
    ? Args
    : never;

type DataFirst<Signature extends DualSignature> = (
  ...args: FixedArity<Parameters<Signature>>
) => ReturnType<Signature>;

/** Supports full application and partial application without the first argument. */
export const dual = <Signature extends DualSignature>(
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

  // The overloads describe argument types. Runtime dispatch checks only their count.
  return dispatch as unknown as Signature;
};

/**
 * Adapts a variadic function to take its arguments as one tuple.
 *
 * Generic functions stay generic, so `spread(Iterable.zip)` still infers positional element types from the tuple it receives.
 *
 * @example
 * ```ts
 * const zipped = spread(Iterable.zip)([ids, positions]);
 * ```
 */
export const spread =
  <Args extends readonly unknown[], Return>(fn: (...args: Args) => Return) =>
  (args: Args): Return =>
    fn(...args);

/**
 * Applies functions from left to right, starting with a value.
 *
 * The value is inferred as a `const` type, so an array literal becomes a tuple and keeps positional types for {@link spread}.
 *
 * @example
 * ```ts
 * const labels = pipe(
 *   [ids, positions],
 *   spread(Iterable.zip),
 *   Iterable.map(([id, position]) => `${id}@${position.x},${position.y}`),
 *   Iterable.collect(),
 * );
 * ```
 */
export function pipe<const A>(value: A): A;
export function pipe<const A, B>(value: A, ab: (value: A) => B): B;
export function pipe<const A, B, C>(
  value: A,
  ab: (value: A) => B,
  bc: (value: B) => C,
): C;
export function pipe<const A, B, C, D>(
  value: A,
  ab: (value: A) => B,
  bc: (value: B) => C,
  cd: (value: C) => D,
): D;
export function pipe<const A, B, C, D, E>(
  value: A,
  ab: (value: A) => B,
  bc: (value: B) => C,
  cd: (value: C) => D,
  de: (value: D) => E,
): E;
export function pipe<const A, B, C, D, E, F>(
  value: A,
  ab: (value: A) => B,
  bc: (value: B) => C,
  cd: (value: C) => D,
  de: (value: D) => E,
  ef: (value: E) => F,
): F;
export function pipe<const A, B, C, D, E, F, G>(
  value: A,
  ab: (value: A) => B,
  bc: (value: B) => C,
  cd: (value: C) => D,
  de: (value: D) => E,
  ef: (value: E) => F,
  fg: (value: F) => G,
): G;

export function pipe(
  value: unknown,
  ...steps: readonly ((value: never) => unknown)[]
): unknown {
  let result = value;
  for (const step of steps) {
    result = step(result as never);
  }
  return result;
}

/** Composes functions left to right, retaining the first function's parameters. */
export function flow<Args extends unknown[], A>(
  ab: (...args: Args) => A,
): (...args: Args) => A;
export function flow<Args extends unknown[], A, B>(
  ab: (...args: Args) => A,
  bc: (value: A) => B,
): (...args: Args) => B;
export function flow<Args extends unknown[], A, B, C>(
  ab: (...args: Args) => A,
  bc: (value: A) => B,
  cd: (value: B) => C,
): (...args: Args) => C;
export function flow<Args extends unknown[], A, B, C, D>(
  ab: (...args: Args) => A,
  bc: (value: A) => B,
  cd: (value: B) => C,
  de: (value: C) => D,
): (...args: Args) => D;
export function flow<Args extends unknown[], A, B, C, D, E>(
  ab: (...args: Args) => A,
  bc: (value: A) => B,
  cd: (value: B) => C,
  de: (value: C) => D,
  ef: (value: D) => E,
): (...args: Args) => E;

export function flow(
  first: (...args: never[]) => unknown,
  ...rest: readonly ((value: never) => unknown)[]
): (...args: never[]) => unknown {
  return (...args) => {
    let value = first(...args);
    for (const transform of rest) {
      value = transform(value as never);
    }
    return value;
  };
}
