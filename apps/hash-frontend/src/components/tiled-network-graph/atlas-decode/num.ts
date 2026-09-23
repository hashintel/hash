/** Branded fixed-width numbers, named after the Rust types they mirror on the wire. */
import * as Option from "./option";

import type { Brand } from "@blockprotocol/type-system";

/** The primitive a branded number is stored as. */
type BaseOf<T> = T extends bigint ? bigint : number;

/**
 * A type accepted as a {@link NumType.widen | widen} target.
 *
 * Only the checked conversion is required, so any {@link NumType} qualifies regardless of its input type.
 */
export type WidenTarget<Target> = (value: never) => Option.Option<Target>;

/**
 * Constructors and operators for one fixed-width number type.
 *
 * `Wider` lists the types that represent every value of this type, as accepted by {@link NumType.widen | widen}.
 */
export interface NumType<
  T extends number | bigint,
  Input = number | bigint,
  Wider extends number | bigint = never,
> {
  /** Converts a value, or returns absence when the type cannot represent it exactly. */
  (value: Input): Option.Option<T>;
  /** Whether a value is already stored as this type, narrowing it. */
  readonly is: (value: number | bigint) => value is T;
  /** Brands a value the caller has already validated, such as a `DataView` read. */
  readonly unsafe: (value: BaseOf<T>) => T;
  /**
   * Converts losslessly into a wider type.
   *
   * @example
   * ```ts
   * const wide = Num.u16.widen(Num.u16.unsafe(300), Num.u64); // 300n as u64
   * ```
   */
  readonly widen: <Target extends Wider>(
    value: T,
    target: WidenTarget<Target>,
  ) => Target;
  /** The smaller of two values. */
  readonly min: (left: T, right: T) => T;
  /** The larger of two values. */
  readonly max: (left: T, right: T) => T;
  /** Both values ordered as `[min, max]`, retaining the argument order when they compare equal. */
  readonly minMax: (left: T, right: T) => readonly [T, T];
  /** Restricts a value to an inclusive range, which must satisfy `lower <= upper`. */
  readonly clamp: (value: T, lower: T, upper: T) => T;
}

/**
 * A checked binary operator with an unchecked form.
 *
 * The call returns absence instead of an unrepresentable result. `unchecked` applies the native operator to the storage type, so the caller guarantees the result is representable and any divisor is nonzero; otherwise the result is unspecified.
 */
export interface Operator<T> {
  (left: T, right: T): Option.Option<T>;
  readonly unchecked: (left: T, right: T) => T;
}

/** Ascending consecutive values, re-iterable and empty when `end` precedes `start`. */
export interface Range<T> {
  /** Values from `start` up to but excluding `end`. */
  (start: T, end: T): Iterable<T>;
  /** Values from `start` through `end`. */
  readonly inclusive: (start: T, end: T) => Iterable<T>;
}

/** A {@link NumType} with a bounded, contiguous range and integer arithmetic. */
export interface IntegerType<
  T extends number | bigint,
  Wider extends number | bigint = never,
> extends NumType<T, number | bigint, Wider> {
  /** The smallest representable value. */
  readonly minValue: T;
  /** The largest representable value. */
  readonly maxValue: T;
  readonly zero: T;
  readonly one: T;
  /** The sum, absent on overflow. */
  readonly add: Operator<T>;
  /** The difference, absent on overflow. */
  readonly sub: Operator<T>;
  /** The product, absent on overflow. */
  readonly mul: Operator<T>;
  /** The quotient truncated toward zero, absent for a zero divisor or `minValue / -1`. */
  readonly div: Operator<T>;
  /** The remainder with the dividend's sign, absent whenever {@link div} is. */
  readonly rem: Operator<T>;
  /** `left` raised to `right`, absent on overflow or for a negative exponent. */
  readonly pow: Operator<T>;
  /**
   * Consecutive values between two bounds.
   *
   * @example
   * ```ts
   * for (const depth of Num.u64.range.inclusive(Num.u64.minValue, targetDepth)) {
   *   // depth: Num.u64
   * }
   * ```
   */
  readonly range: Range<T>;
}

/** Native integer operators for one storage type. */
interface Arithmetic<T> {
  readonly add: (left: T, right: T) => T;
  readonly sub: (left: T, right: T) => T;
  readonly mul: (left: T, right: T) => T;
  readonly div: (left: T, right: T) => T;
  readonly rem: (left: T, right: T) => T;
  readonly pow: (left: T, right: T) => T;
}

const numberArithmetic: Arithmetic<number> = {
  add: (left, right) => left + right,
  sub: (left, right) => left - right,
  mul: (left, right) => left * right,
  div: (left, right) => Math.trunc(left / right),
  rem: (left, right) => left % right,
  pow: (left, right) => left ** right,
};

const bigintArithmetic: Arithmetic<bigint> = {
  add: (left, right) => left + right,
  sub: (left, right) => left - right,
  mul: (left, right) => left * right,
  div: (left, right) => left / right,
  rem: (left, right) => left % right,
  pow: (left, right) => left ** right,
};

const operator = <T>(
  checked: (left: T, right: T) => Option.Option<T>,
  unchecked: (left: T, right: T) => T,
): Operator<T> => Object.assign(checked, { unchecked });

/** Operators shared by every type, which depend on the value alone. */
const common = <T extends number | bigint, Wider extends number | bigint>() => {
  const min = (left: T, right: T): T => (right < left ? right : left);
  const max = (left: T, right: T): T => (right > left ? right : left);

  return {
    min,
    max,
    minMax: (left: T, right: T): readonly [T, T] =>
      right < left ? [right, left] : [left, right],
    clamp: (value: T, lower: T, upper: T): T => min(max(value, lower), upper),
    widen: <Target extends Wider>(
      value: T,
      target: WidenTarget<Target>,
    ): Target =>
      // Every value of T is representable in a permitted target, so the checked conversion is present.
      Option.unwrapOrElse(
        (target as (value: T) => Option.Option<Target>)(value),
        () => {
          throw new TypeError(
            `${String(value)} is not representable in the widen target`,
          );
        },
      ),
  };
};

const integer = <
  T extends number | bigint,
  Wider extends number | bigint = never,
>(
  min: bigint,
  max: bigint,
  fromBigInt: (value: bigint) => T,
): IntegerType<T, Wider> => {
  const lower = fromBigInt(min);
  const wideStorage = typeof lower === "bigint";
  const bits = BigInt((max - min + 1n).toString(2).length - 1);
  // Both tables share a shape. Which applies is fixed by the storage type, which every T value has.
  const native = (wideStorage
    ? bigintArithmetic
    : numberArithmetic) as unknown as Arithmetic<T>;

  const convert = (value: number | bigint): Option.Option<T> => {
    if (typeof value === "number" && !Number.isInteger(value)) {
      return Option.none();
    }
    const wide = BigInt(value);

    return wide >= min && wide <= max
      ? Option.some(fromBigInt(wide))
      : Option.none();
  };

  const div = (left: T, right: T): Option.Option<T> => {
    const divisor = BigInt(right);

    return divisor === 0n ? Option.none() : convert(BigInt(left) / divisor);
  };

  const pow = (left: T, right: T): Option.Option<T> => {
    const base = BigInt(left);
    const exponent = BigInt(right);

    if (exponent < 0n) {
      return Option.none();
    }
    // Powers of 0 and ±1 are decided without evaluating them, and any other base overflows before the exponent reaches the bit width, so the power stays cheap to evaluate.
    if (base === 0n) {
      return convert(exponent === 0n ? 1n : 0n);
    }
    if (base === 1n || base === -1n) {
      return convert(base === 1n || exponent % 2n === 0n ? 1n : -1n);
    }
    if (exponent > bits) {
      return Option.none();
    }

    return convert(base ** exponent);
  };

  const one = fromBigInt(1n);
  const range = (start: T, end: T, inclusive: boolean): Iterable<T> => ({
    *[Symbol.iterator](): Generator<T, void, unknown> {
      // `end` is representable, so the step past it cannot leave the storage type's exact range.
      for (
        let value = start;
        inclusive ? value <= end : value < end;
        value = native.add(value, one)
      ) {
        yield value;
      }
    },
  });

  return Object.assign(convert, common<T, Wider>(), {
    is: (value: number | bigint): value is T =>
      (typeof value === "bigint") === wideStorage &&
      Option.isSome(convert(value)),
    unsafe: (value: BaseOf<T>): T => value as T,
    minValue: lower,
    maxValue: fromBigInt(max),
    zero: fromBigInt(0n),
    one,
    add: operator(
      (left: T, right: T) => convert(BigInt(left) + BigInt(right)),
      native.add,
    ),
    sub: operator(
      (left: T, right: T) => convert(BigInt(left) - BigInt(right)),
      native.sub,
    ),
    mul: operator(
      (left: T, right: T) => convert(BigInt(left) * BigInt(right)),
      native.mul,
    ),
    range: Object.assign((start: T, end: T) => range(start, end, false), {
      inclusive: (start: T, end: T) => range(start, end, true),
    }),
    div: operator(div, native.div),
    rem: operator(
      (left: T, right: T) =>
        Option.map(div(left, right), () =>
          fromBigInt(BigInt(left) % BigInt(right)),
        ),
      native.rem,
    ),
    pow: operator(pow, native.pow),
  });
};

/** A {@link NumType} with floating-point storage. */
export interface FloatType<
  T extends number,
  Wider extends number = never,
> extends NumType<T, number, Wider> {
  /**
   * The nearest representable value, rounding like Rust's `as` cast.
   *
   * Use it where a computation is inherently approximate, such as a distance, so that an exact integer of any width can enter it without a fallible conversion. Every integer below 2 ** 53 in magnitude is exact in an {@link f64}.
   */
  readonly approximate: (value: number | bigint) => T;
}

const float = <T extends number, Wider extends number = never>(
  round: (value: number) => number,
): FloatType<T, Wider> => {
  const representable = (value: number) =>
    Number.isNaN(value) || round(value) === value;

  return Object.assign(
    (value: number): Option.Option<T> =>
      Option.liftPredicate(value, (candidate): candidate is T =>
        representable(candidate),
      ),
    common<T, Wider>(),
    {
      is: (value: number | bigint): value is T =>
        typeof value === "number" && representable(value),
      unsafe: (value: number): T => value as T,
      approximate: (value: number | bigint): T => round(Number(value)) as T,
    },
  );
};

const unsigned = <
  T extends number | bigint,
  Wider extends number | bigint = never,
>(
  bits: number,
  fromBigInt: (value: bigint) => T,
): IntegerType<T, Wider> => integer(0n, 2n ** BigInt(bits) - 1n, fromBigInt);

const signed = <
  T extends number | bigint,
  Wider extends number | bigint = never,
>(
  bits: number,
  fromBigInt: (value: bigint) => T,
): IntegerType<T, Wider> =>
  integer(-(2n ** BigInt(bits - 1)), 2n ** BigInt(bits - 1) - 1n, fromBigInt);

const asNumber = <T extends number>(value: bigint): T => Number(value) as T;
const asBigInt = <T extends bigint>(value: bigint): T => value as T;

export type u8 = Brand<number, "u8">;
export const u8 = unsigned<u8, u16 | u32 | u64 | i16 | i32 | i64 | f32 | f64>(
  8,
  asNumber,
);

export type u16 = Brand<number, "u16">;
export const u16 = unsigned<u16, u32 | u64 | i32 | i64 | f32 | f64>(
  16,
  asNumber,
);

export type u32 = Brand<number, "u32">;
export const u32 = unsigned<u32, u64 | i64 | f64>(32, asNumber);

export type u64 = Brand<bigint, "u64">;
export const u64 = unsigned<u64>(64, asBigInt);

export type i8 = Brand<number, "i8">;
export const i8 = signed<i8, i16 | i32 | i64 | f32 | f64>(8, asNumber);

export type i16 = Brand<number, "i16">;
export const i16 = signed<i16, i32 | i64 | f32 | f64>(16, asNumber);

export type i32 = Brand<number, "i32">;
export const i32 = signed<i32, i64 | f64>(32, asNumber);

export type i64 = Brand<bigint, "i64">;
export const i64 = signed<i64>(64, asBigInt);

/** A single-precision float. Conversion accepts values that survive a round trip through `Math.fround`, including `NaN` and the infinities. */
export type f32 = Brand<number, "f32">;
export const f32 = float<f32, f64>(Math.fround);

/** A double-precision float, which every `number` already is. */
export type f64 = Brand<number, "f64">;
export const f64 = float<f64>((value) => value);
