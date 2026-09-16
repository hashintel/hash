import { describe, expect, expectTypeOf, it } from "vitest";

import * as Num from "./Num";
import * as Option from "./Option";

describe("Num", () => {
  describe("bounds", () => {
    it.each([
      { type: Num.u8, min: 0, max: 255 },
      { type: Num.u16, min: 0, max: 65535 },
      { type: Num.u32, min: 0, max: 4294967295 },
      { type: Num.i8, min: -128, max: 127 },
      { type: Num.i16, min: -32768, max: 32767 },
      { type: Num.i32, min: -2147483648, max: 2147483647 },
    ])("narrow_$min_$max", ({ type, min, max }) => {
      expect(type.minValue).toBe(min);
      expect(type.maxValue).toBe(max);
      expect(type(min)).toEqual(Option.some(min));
      expect(type(max)).toEqual(Option.some(max));
      expect(type(min - 1)).toEqual(Option.none());
      expect(type(max + 1)).toEqual(Option.none());
    });

    it.each([
      { type: Num.u64, min: 0n, max: 18446744073709551615n },
      { type: Num.i64, min: -9223372036854775808n, max: 9223372036854775807n },
    ])("wide_$min_$max", ({ type, min, max }) => {
      expect(type.minValue).toBe(min);
      expect(type.maxValue).toBe(max);
      expect(type(min)).toEqual(Option.some(min));
      expect(type(max)).toEqual(Option.some(max));
      expect(type(min - 1n)).toEqual(Option.none());
      expect(type(max + 1n)).toEqual(Option.none());
    });
  });

  describe("conversion", () => {
    it("narrow_from_bigint", () => {
      expect(Num.u8(255n)).toEqual(Option.some(255));
      expect(Num.u8(256n)).toEqual(Option.none());
      expect(Num.i8(-128n)).toEqual(Option.some(-128));
    });

    it("wide_from_number", () => {
      expect(Num.u64(0)).toEqual(Option.some(0n));
      expect(Num.u64(Number.MAX_SAFE_INTEGER)).toEqual(
        Option.some(BigInt(Number.MAX_SAFE_INTEGER)),
      );
      expect(Num.i64(-1)).toEqual(Option.some(-1n));
      expect(Num.u64(-1)).toEqual(Option.none());
    });

    it("between_types", () => {
      const wide = Num.u64.unsafe(300n);
      expect(Num.u16(wide)).toEqual(Option.some(300));
      expect(Num.u8(wide)).toEqual(Option.none());
    });

    it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY, -0.1])(
      "non_integer_%s",
      (value) => {
        expect(Num.u8(value)).toEqual(Option.none());
        expect(Num.u64(value)).toEqual(Option.none());
      },
    );

    it("types", () => {
      expectTypeOf(Num.u8(1)).toEqualTypeOf<Option.Option<Num.u8>>();
      expectTypeOf(Num.u64(1)).toEqualTypeOf<Option.Option<Num.u64>>();
      expectTypeOf(Num.u8.unsafe(1)).toEqualTypeOf<Num.u8>();
      expectTypeOf(Num.u64.unsafe(1n)).toEqualTypeOf<Num.u64>();
      expectTypeOf(Num.u8.minValue).toEqualTypeOf<Num.u8>();
      // @ts-expect-error -- a wide type is stored as a bigint.
      Num.u64.unsafe(1);
      // @ts-expect-error -- a narrow type is stored as a number.
      Num.u8.unsafe(1n);
    });
  });

  describe("widen", () => {
    it("within_number_storage", () => {
      const byte = Num.u8.unsafe(255);
      expect(Num.u8.widen(byte, Num.u16)).toBe(255);
      expect(Num.u8.widen(byte, Num.i16)).toBe(255);
      expect(Num.i8.widen(Num.i8.unsafe(-128), Num.i32)).toBe(-128);
      expect(Num.u16.widen(Num.u16.unsafe(65535), Num.f32)).toBe(65535);
      expectTypeOf(Num.u8.widen(byte, Num.u16)).toEqualTypeOf<Num.u16>();
      expectTypeOf(
        Num.u16.widen(Num.u16.unsafe(1), Num.i32),
      ).toEqualTypeOf<Num.i32>();
    });

    it("into_bigint_storage", () => {
      expect(Num.u16.widen(Num.u16.unsafe(300), Num.u64)).toBe(300n);
      expect(Num.u32.widen(Num.u32.maxValue, Num.u64)).toBe(4294967295n);
      expect(Num.i32.widen(Num.i32.minValue, Num.i64)).toBe(-2147483648n);
      expectTypeOf(
        Num.u16.widen(Num.u16.unsafe(1), Num.u64),
      ).toEqualTypeOf<Num.u64>();
    });

    it("float_to_wider_float", () => {
      const half = Num.f32.unsafe(0.5);
      expect(Num.f32.widen(half, Num.f64)).toBe(0.5);
      expectTypeOf(Num.f32.widen(half, Num.f64)).toEqualTypeOf<Num.f64>();
    });

    it("lossy_targets_rejected", () => {
      const wide = Num.u64.unsafe(1n);
      // @ts-expect-error -- u64 has no wider type.
      Num.u64.widen(wide, Num.i64);
      // @ts-expect-error -- u32 does not fit an f32 mantissa.
      Num.u32.widen(Num.u32.unsafe(1), Num.f32);
      // @ts-expect-error -- u8 does not fit an i8.
      Num.u8.widen(Num.u8.unsafe(1), Num.i8);
      // @ts-expect-error -- the value must already be a u8.
      Num.u8.widen(1, Num.u16);
    });
  });

  describe("is", () => {
    it("narrow_requires_number", () => {
      expect(Num.u8.is(255)).toBe(true);
      expect(Num.u8.is(256)).toBe(false);
      expect(Num.u8.is(1.5)).toBe(false);
      expect(Num.u8.is(1n)).toBe(false);
    });

    it("wide_requires_bigint", () => {
      expect(Num.u64.is(1n)).toBe(true);
      expect(Num.u64.is(-1n)).toBe(false);
      expect(Num.u64.is(1)).toBe(false);
    });

    it("narrows", () => {
      const value = 1 as number | bigint;
      if (Num.u8.is(value)) {
        expectTypeOf(value).toEqualTypeOf<Num.u8>();
      }
    });
  });

  describe("operators", () => {
    it("ordering_narrow", () => {
      const one = Num.u8.unsafe(1);
      const nine = Num.u8.unsafe(9);
      expect(Num.u8.min(one, nine)).toBe(1);
      expect(Num.u8.min(nine, one)).toBe(1);
      expect(Num.u8.max(one, nine)).toBe(9);
      expect(Num.u8.max(nine, one)).toBe(9);
      expect(Num.u8.clamp(Num.u8.unsafe(0), one, nine)).toBe(1);
      expect(Num.u8.clamp(Num.u8.unsafe(5), one, nine)).toBe(5);
      expect(Num.u8.clamp(Num.u8.unsafe(200), one, nine)).toBe(9);
      expectTypeOf(Num.u8.min(one, nine)).toEqualTypeOf<Num.u8>();
    });

    it("ordering_wide", () => {
      const one = Num.u64.unsafe(1n);
      const large = Num.u64.unsafe(2n ** 60n);
      expect(Num.u64.min(large, one)).toBe(1n);
      expect(Num.u64.max(one, large)).toBe(2n ** 60n);
      expect(Num.u64.clamp(Num.u64.unsafe(0n), one, large)).toBe(1n);
      expect(Num.u64.clamp(Num.u64.maxValue, one, large)).toBe(2n ** 60n);
      expectTypeOf(Num.u64.max(one, large)).toEqualTypeOf<Num.u64>();
    });

    it("min_max_pair", () => {
      const one = Num.u8.unsafe(1);
      const nine = Num.u8.unsafe(9);
      expect(Num.u8.minMax(one, nine)).toEqual([1, 9]);
      expect(Num.u8.minMax(nine, one)).toEqual([1, 9]);
      expect(Num.u64.minMax(Num.u64.unsafe(5n), Num.u64.unsafe(2n))).toEqual([
        2n,
        5n,
      ]);
      expectTypeOf(Num.u8.minMax(one, nine)).toEqualTypeOf<
        readonly [Num.u8, Num.u8]
      >();
    });

    it("min_max_stable_when_equal", () => {
      // Equal floats that are distinguishable: -0 and +0 compare equal.
      const negativeZero = Num.f64.unsafe(-0);
      const positiveZero = Num.f64.unsafe(0);
      const [first, second] = Num.f64.minMax(negativeZero, positiveZero);
      expect(Object.is(first, -0)).toBe(true);
      expect(Object.is(second, 0)).toBe(true);
      const [third, fourth] = Num.f64.minMax(positiveZero, negativeZero);
      expect(Object.is(third, 0)).toBe(true);
      expect(Object.is(fourth, -0)).toBe(true);
    });

    it("ordering_mixed_brands_rejected", () => {
      // @ts-expect-error -- operands share one type.
      Num.u8.min(Num.u8.unsafe(1), Num.u16.unsafe(1));
      // @ts-expect-error -- operands are branded.
      Num.u64.max(1n, 2n);
    });

    it("checked_arithmetic_narrow", () => {
      const high = Num.u8.unsafe(200);
      const low = Num.u8.unsafe(100);
      expect(Num.u8.add(low, low)).toEqual(Option.some(200));
      expect(Num.u8.add(high, low)).toEqual(Option.none());
      expect(Num.u8.sub(high, low)).toEqual(Option.some(100));
      expect(Num.u8.sub(low, high)).toEqual(Option.none());
      expect(Num.u8.mul(Num.u8.unsafe(15), Num.u8.unsafe(17))).toEqual(
        Option.some(255),
      );
      expect(Num.u8.mul(Num.u8.unsafe(16), Num.u8.unsafe(16))).toEqual(
        Option.none(),
      );
      expectTypeOf(Num.u8.add(low, low)).toEqualTypeOf<Option.Option<Num.u8>>();
    });

    it("checked_arithmetic_signed", () => {
      expect(Num.i8.sub(Num.i8.unsafe(-100), Num.i8.unsafe(100))).toEqual(
        Option.none(),
      );
      expect(Num.i8.sub(Num.i8.unsafe(-28), Num.i8.unsafe(100))).toEqual(
        Option.some(-128),
      );
      expect(Num.i8.mul(Num.i8.unsafe(-1), Num.i8.minValue)).toEqual(
        Option.none(),
      );
    });

    it("division_truncates_toward_zero", () => {
      const seven = Num.i8.unsafe(7);
      const two = Num.i8.unsafe(2);
      const minusTwo = Num.i8.unsafe(-2);
      const minusSeven = Num.i8.unsafe(-7);
      expect(Num.i8.div(seven, two)).toEqual(Option.some(3));
      expect(Num.i8.div(minusSeven, two)).toEqual(Option.some(-3));
      expect(Num.i8.div(seven, minusTwo)).toEqual(Option.some(-3));
      expect(Num.i8.rem(seven, two)).toEqual(Option.some(1));
      expect(Num.i8.rem(minusSeven, two)).toEqual(Option.some(-1));
      expect(Num.i8.rem(seven, minusTwo)).toEqual(Option.some(1));
      expectTypeOf(Num.i8.div(seven, two)).toEqualTypeOf<
        Option.Option<Num.i8>
      >();
    });

    it("division_by_zero", () => {
      const zero = Num.u8.unsafe(0);
      const one = Num.u8.unsafe(1);
      expect(Num.u8.div(one, zero)).toEqual(Option.none());
      expect(Num.u8.rem(one, zero)).toEqual(Option.none());
      expect(Num.u8.div(zero, one)).toEqual(Option.some(0));
      expect(Num.u8.rem(zero, one)).toEqual(Option.some(0));
      expect(Num.u64.div(Num.u64.unsafe(1n), Num.u64.unsafe(0n))).toEqual(
        Option.none(),
      );
    });

    it("division_overflow", () => {
      const minusOne = Num.i8.unsafe(-1);
      expect(Num.i8.div(Num.i8.minValue, minusOne)).toEqual(Option.none());
      expect(Num.i8.rem(Num.i8.minValue, minusOne)).toEqual(Option.none());
      expect(Num.i8.div(Num.i8.maxValue, minusOne)).toEqual(Option.some(-127));
      expect(Num.i64.div(Num.i64.minValue, Num.i64.unsafe(-1n))).toEqual(
        Option.none(),
      );
    });

    it("division_wide", () => {
      const large = Num.u64.unsafe(2n ** 63n);
      const three = Num.u64.unsafe(3n);
      expect(Num.u64.div(large, three)).toEqual(Option.some(2n ** 63n / 3n));
      expect(Num.u64.rem(large, three)).toEqual(Option.some(2n ** 63n % 3n));
    });

    it("unchecked_arithmetic_narrow", () => {
      const seven = Num.i8.unsafe(7);
      const minusTwo = Num.i8.unsafe(-2);
      expect(Num.i8.add.unchecked(seven, minusTwo)).toBe(5);
      expect(Num.i8.sub.unchecked(seven, minusTwo)).toBe(9);
      expect(Num.i8.mul.unchecked(seven, minusTwo)).toBe(-14);
      expect(Num.i8.div.unchecked(seven, minusTwo)).toBe(-3);
      expect(Num.i8.rem.unchecked(seven, minusTwo)).toBe(1);
      expect(Num.u32.div.unchecked(Num.u32.maxValue, Num.u32.unsafe(3))).toBe(
        1431655765,
      );
      expectTypeOf(
        Num.i8.add.unchecked(seven, minusTwo),
      ).toEqualTypeOf<Num.i8>();
    });

    it("unchecked_arithmetic_wide", () => {
      const large = Num.u64.unsafe(2n ** 63n);
      const three = Num.u64.unsafe(3n);
      expect(Num.u64.add.unchecked(large, three)).toBe(2n ** 63n + 3n);
      expect(Num.u64.sub.unchecked(large, three)).toBe(2n ** 63n - 3n);
      expect(Num.u64.mul.unchecked(three, three)).toBe(9n);
      expect(Num.u64.div.unchecked(large, three)).toBe(2n ** 63n / 3n);
      expect(Num.u64.rem.unchecked(large, three)).toBe(2n ** 63n % 3n);
      expect(
        Num.i64.div.unchecked(Num.i64.unsafe(-7n), Num.i64.unsafe(2n)),
      ).toBe(-3n);
      expectTypeOf(
        Num.u64.mul.unchecked(three, three),
      ).toEqualTypeOf<Num.u64>();
    });

    it("checked_arithmetic_wide", () => {
      const one = Num.u64.unsafe(1n);
      expect(Num.u64.add(Num.u64.maxValue, one)).toEqual(Option.none());
      expect(Num.u64.sub(Num.u64.minValue, one)).toEqual(Option.none());
      expect(
        Num.u64.mul(Num.u64.unsafe(2n ** 32n), Num.u64.unsafe(2n ** 32n)),
      ).toEqual(Option.none());
      expect(
        Num.u64.mul(Num.u64.unsafe(2n ** 32n), Num.u64.unsafe(2n ** 31n)),
      ).toEqual(Option.some(2n ** 63n));
      expectTypeOf(Num.u64.add(one, one)).toEqualTypeOf<
        Option.Option<Num.u64>
      >();
    });
  });

  describe("constants", () => {
    it("zero_and_one", () => {
      expect(Num.u8.zero).toBe(0);
      expect(Num.u8.one).toBe(1);
      expect(Num.i64.zero).toBe(0n);
      expect(Num.i64.one).toBe(1n);
      expectTypeOf(Num.u8.zero).toEqualTypeOf<Num.u8>();
      expectTypeOf(Num.u64.one).toEqualTypeOf<Num.u64>();
    });
  });

  describe("pow", () => {
    it("checked", () => {
      const two = Num.u8.unsafe(2);
      expect(Num.u8.pow(two, Num.u8.unsafe(7))).toEqual(Option.some(128));
      expect(Num.u8.pow(two, Num.u8.unsafe(8))).toEqual(Option.none());
      expect(Num.u8.pow(two, Num.u8.zero)).toEqual(Option.some(1));
      expect(Num.u8.pow(Num.u8.zero, Num.u8.zero)).toEqual(Option.some(1));
      expect(Num.u8.pow(Num.u8.zero, Num.u8.maxValue)).toEqual(Option.some(0));
      expect(Num.u8.pow(Num.u8.one, Num.u8.maxValue)).toEqual(Option.some(1));
      expectTypeOf(Num.u8.pow(two, two)).toEqualTypeOf<Option.Option<Num.u8>>();
    });

    it("checked_signed", () => {
      const minusOne = Num.i8.unsafe(-1);
      const minusTwo = Num.i8.unsafe(-2);
      expect(Num.i8.pow(minusOne, Num.i8.maxValue)).toEqual(Option.some(-1));
      expect(Num.i8.pow(minusOne, Num.i8.unsafe(126))).toEqual(Option.some(1));
      expect(Num.i8.pow(minusTwo, Num.i8.unsafe(7))).toEqual(Option.some(-128));
      expect(Num.i8.pow(minusTwo, Num.i8.unsafe(8))).toEqual(Option.none());
      expect(Num.i8.pow(Num.i8.unsafe(2), minusOne)).toEqual(Option.none());
    });

    it("checked_wide_and_large_exponent", () => {
      const two = Num.u64.unsafe(2n);
      expect(Num.u64.pow(two, Num.u64.unsafe(63n))).toEqual(
        Option.some(2n ** 63n),
      );
      expect(Num.u64.pow(two, Num.u64.unsafe(64n))).toEqual(Option.none());
      expect(Num.u64.pow(two, Num.u64.maxValue)).toEqual(Option.none());
      expect(Num.u64.pow(Num.u64.one, Num.u64.maxValue)).toEqual(
        Option.some(1n),
      );
    });

    it("unchecked", () => {
      expect(Num.u8.pow.unchecked(Num.u8.unsafe(3), Num.u8.unsafe(4))).toBe(81);
      expect(
        Num.u64.pow.unchecked(Num.u64.unsafe(2n), Num.u64.unsafe(16n)),
      ).toBe(65536n);
      expectTypeOf(
        Num.u64.pow.unchecked(Num.u64.one, Num.u64.one),
      ).toEqualTypeOf<Num.u64>();
    });
  });

  describe("range", () => {
    it("half_open", () => {
      expect([...Num.u8.range(Num.u8.unsafe(2), Num.u8.unsafe(5))]).toEqual([
        2, 3, 4,
      ]);
      expect([
        ...Num.u64.range(Num.u64.unsafe(2n), Num.u64.unsafe(5n)),
      ]).toEqual([2n, 3n, 4n]);
      expect([...Num.i8.range(Num.i8.unsafe(-2), Num.i8.unsafe(1))]).toEqual([
        -2, -1, 0,
      ]);
    });

    it("inclusive", () => {
      expect([
        ...Num.u8.range.inclusive(Num.u8.unsafe(2), Num.u8.unsafe(5)),
      ]).toEqual([2, 3, 4, 5]);
      expect([
        ...Num.u64.range.inclusive(Num.u64.unsafe(2n), Num.u64.unsafe(5n)),
      ]).toEqual([2n, 3n, 4n, 5n]);
    });

    it("empty_and_single", () => {
      const three = Num.u8.unsafe(3);
      expect([...Num.u8.range(three, three)]).toEqual([]);
      expect([...Num.u8.range(Num.u8.unsafe(5), three)]).toEqual([]);
      expect([...Num.u8.range.inclusive(three, three)]).toEqual([3]);
      expect([...Num.u8.range.inclusive(Num.u8.unsafe(5), three)]).toEqual([]);
    });

    it("reaches_bounds", () => {
      expect([
        ...Num.u8.range.inclusive(Num.u8.unsafe(254), Num.u8.maxValue),
      ]).toEqual([254, 255]);
      expect([
        ...Num.i8.range.inclusive(Num.i8.minValue, Num.i8.unsafe(-127)),
      ]).toEqual([-128, -127]);
      expect([
        ...Num.u64.range.inclusive(
          Num.u64.unsafe(Num.u64.maxValue - 1n),
          Num.u64.maxValue,
        ),
      ]).toEqual([2n ** 64n - 2n, 2n ** 64n - 1n]);
    });

    it("re_iterable_and_typed", () => {
      const values = Num.u16.range(Num.u16.unsafe(0), Num.u16.unsafe(3));
      expect([...values]).toEqual([0, 1, 2]);
      expect([...values]).toEqual([0, 1, 2]);
      expectTypeOf(values).toEqualTypeOf<Iterable<Num.u16>>();
      for (const value of values) {
        expectTypeOf(value).toEqualTypeOf<Num.u16>();
      }
    });
  });

  describe("floats", () => {
    it("f32_representable", () => {
      expect(Num.f32(0.5)).toEqual(Option.some(0.5));
      expect(Num.f32(Math.fround(0.1))).toEqual(Option.some(Math.fround(0.1)));
      expect(Num.f32(0.1)).toEqual(Option.none());
      expect(Num.f32(Number.POSITIVE_INFINITY)).toEqual(
        Option.some(Number.POSITIVE_INFINITY),
      );
      expect(Option.isSome(Num.f32(Number.NaN))).toBe(true);
      expect(Num.f32.is(1n)).toBe(false);
    });

    it("approximate_rounds", () => {
      expect(Num.f64.approximate(Num.u64.unsafe(300n))).toBe(300);
      expect(Num.f64.approximate(Num.u64.maxValue)).toBe(2 ** 64);
      expect(Num.f64.approximate(2n ** 53n + 1n)).toBe(2 ** 53);
      expect(Num.f32.approximate(0.1)).toBe(Math.fround(0.1));
      expect(Num.f32.approximate(2n ** 24n + 1n)).toBe(2 ** 24);
      expectTypeOf(Num.f64.approximate(1n)).toEqualTypeOf<Num.f64>();
      expectTypeOf(Num.f32.approximate(1)).toEqualTypeOf<Num.f32>();
    });

    it("float_ordering", () => {
      const half = Num.f32.unsafe(0.5);
      const two = Num.f32.unsafe(2);
      expect(Num.f32.min(two, half)).toBe(0.5);
      expect(Num.f32.max(half, two)).toBe(2);
      expect(
        Num.f64.clamp(
          Num.f64.unsafe(3.5),
          Num.f64.unsafe(0),
          Num.f64.unsafe(1),
        ),
      ).toBe(1);
      expectTypeOf(Num.f32.min(half, two)).toEqualTypeOf<Num.f32>();
    });

    it("f64_any_number", () => {
      expect(Num.f64(0.1)).toEqual(Option.some(0.1));
      expect(Num.f64(Number.NaN)._tag).toBe("some");
      expect(Num.f64.is(1n)).toBe(false);
      expectTypeOf(Num.f64.unsafe(1)).toEqualTypeOf<Num.f64>();
    });
  });
});
