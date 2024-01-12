/* eslint-disable unicorn/filename-case */
import * as S from "@effect/schema/Schema";
import { Either } from "effect";

const makeInt = <
  const Brand extends string,
  const Min extends number,
  const Max extends number,
>(
  brand: Brand,
  min: Min,
  max: Max,
) => S.number.pipe(S.int(), S.between(min, max), S.brand(brand));

const makeBigInt = <
  const Brand extends string,
  const Min extends bigint,
  const Max extends bigint,
>(
  brand: Brand,
  min: Min,
  max: Max,
) => S.bigint.pipe(S.betweenBigint(min, max), S.brand(brand));

const U8_MIN = 0;
const U8_MAX = 255;
export const u8 = makeInt("u8", U8_MIN, U8_MAX);
export type u8 = S.Schema.To<typeof u8>;
export type u8From = S.Schema.From<typeof u8>;

const U16_MIN = 0;
const U16_MAX = 65535;

export const u16 = makeInt("u16", U16_MIN, U16_MAX);
export type u16 = S.Schema.To<typeof u16>;
export type u16From = S.Schema.From<typeof u16>;

const U32_MIN = 0;
const U32_MAX = 4294967295;

export const u32 = makeInt("u32", U32_MIN, U32_MAX);
export type u32 = S.Schema.To<typeof u32>;
export type u32From = S.Schema.From<typeof u32>;

const U64_MIN = 0n;
const U64_MAX = 18446744073709551615n;

export const u64 = makeBigInt("u64", U64_MIN, U64_MAX);
export type u64 = S.Schema.To<typeof u64>;
export type u64From = S.Schema.From<typeof u64>;

const U128_MIN = 0n;
const U128_MAX = 340282366920938463463374607431768211455n;

export const u128 = makeBigInt("u128", U128_MIN, U128_MAX);
export type u128 = S.Schema.To<typeof u128>;
export type u128From = S.Schema.From<typeof u128>;

const I8_MIN = -128;
const I8_MAX = 127;

export const i8 = makeInt("i8", I8_MIN, I8_MAX);
export type i8 = S.Schema.To<typeof i8>;
export type i8From = S.Schema.From<typeof i8>;

const I16_MIN = -32768;
const I16_MAX = 32767;

export const i16 = makeInt("i16", I16_MIN, I16_MAX);
export type i16 = S.Schema.To<typeof i16>;
export type i16From = S.Schema.From<typeof i16>;

const I32_MIN = -2147483648;
const I32_MAX = 2147483647;

export const i32 = makeInt("i32", I32_MIN, I32_MAX);
export type i32 = S.Schema.To<typeof i32>;
export type i32From = S.Schema.From<typeof i32>;

const I64_MIN = -9223372036854775808n;
const I64_MAX = 9223372036854775807n;

export const i64 = makeBigInt("i64", I64_MIN, I64_MAX);
export type i64 = S.Schema.To<typeof i64>;
export type i64From = S.Schema.From<typeof i64>;

const I128_MIN = -170141183460469231731687303715884105728n;
const I128_MAX = 170141183460469231731687303715884105727n;

export const i128 = makeBigInt("i128", I128_MIN, I128_MAX);
export type i128 = S.Schema.To<typeof i128>;
export type i128From = S.Schema.From<typeof i128>;

export const char = S.string.pipe(S.length(1), S.brand("char"));
export type char = S.Schema.To<typeof char>;
export type charFrom = S.Schema.From<typeof char>;

export const result = <OkFrom, OkTo, ErrFrom, ErrTo>(
  Ok: S.Schema<OkFrom, OkTo>,
  Err: S.Schema<ErrFrom, ErrTo>,
) =>
  S.transform(
    S.union(S.struct({ Ok }), S.struct({ Err })),
    S.eitherFromSelf(S.to(Err), S.to(Ok)),
    (value) => {
      if ("Ok" in value) {
        return Either.right(value.Ok);
      } else {
        return Either.left(value.Err);
      }
    },
    Either.match({
      onLeft: (err) => ({ Err: err }),
      onRight: (ok) => ({ Ok: ok }),
    }),
  );
