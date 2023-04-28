mod common;

use deer::{
    value::{
        I128Deserializer, I16Deserializer, I32Deserializer, I64Deserializer, I8Deserializer,
        U128Deserializer, U16Deserializer, U32Deserializer, U64Deserializer, U8Deserializer,
    },
    Context, Deserialize, Number,
};
use deer_desert::{assert_tokens, assert_tokens_error, error, Token};
use num_traits::cast::FromPrimitive;
use proptest::prelude::*;
use serde_json::json;

// we do not test atomics, as they only delegate to `Atomic*` and are not `PartialEq`

// use the value deserializers to see if we can tolerate different `visit_` without any problems
macro_rules! proptest_fit {
    ($primitive:ident | $value:ident:: $deserializer:ident) => {
        paste::paste! {
            #[cfg(not(miri))]
            proptest! {
                #[test]
                fn [< $primitive _fit _ $value >](value in any::<$value>()) {
                    let context = Context::new();
                    let deserializer = $deserializer::new(value, &context);

                    // ensures that we don't accidentally make a cast that might truncate
                    let expected = $primitive::from(value);
                    let received: $primitive = $primitive::deserialize(deserializer)
                        .expect("should be able to deserialize");

                    assert_eq!(received, expected);
                }
            }
        }
    };
}

macro_rules! proptest_try_fit {
    ($primitive:ident | $value:ident:: $deserializer:ident) => {
        paste::paste! {
            #[cfg(not(miri))]
            proptest! {
                #[test]
                fn [< $primitive _fit _ $value >](value in any::<$value>()) {
                    let context = Context::new();
                    let deserializer = $deserializer::new(value, &context);

                    let expected = $primitive::try_from(value);
                    let received = $primitive::deserialize(deserializer);

                    match expected {
                        Ok(expected) => {
                            // we could convert value to $primitive, therefore we can
                            // assume that the value should also correctly deserialize
                            let received = received.expect("should be able to deserialize");

                            assert_eq!(received, expected);
                        },
                        Err(_) => {
                            // the value wasn't able to fit, we should expect an error
                            // in that case the error should be a `ValueError`
                            // for we do not test if that is the case
                            let _error = received.expect_err("should have not accepted the value");
                        }
                    }
                }
            }
        }
    };
}

macro_rules! proptest_integral {
    (
        Token::
        $token:ident($primitive:ident $(as $equivalent:ident)?);
        $($method:ident !($($val:ident:: $visit:ident),*);)*
    ) => {
        paste::paste! {
            #[cfg(not(miri))]
            proptest! {
                #[test]
                fn [< $primitive _ok >](value in any::<$primitive>()) {
                    assert_tokens(&value, &[Token::$token((value $(as $equivalent)?).into())]);
                }
            }
        }

        $($($method!($primitive | $val :: $visit);)*)*
    };
}

proptest_integral!(
    Token::Number(u8);
    proptest_try_fit!(i8 :: I8Deserializer, i16 :: I16Deserializer, i32 :: I32Deserializer, i64 :: I64Deserializer, i128 :: I128Deserializer, u16 :: U16Deserializer, u32 :: U32Deserializer, u64 :: U64Deserializer, u128 :: U128Deserializer);
);

proptest_integral!(
    Token::Number(u16);
    proptest_fit!(u8 :: U8Deserializer);
    proptest_try_fit!(i8 :: I8Deserializer, i16 :: I16Deserializer, i32 :: I32Deserializer, i64 :: I64Deserializer, i128 :: I128Deserializer, u32 :: U32Deserializer, u64 :: U64Deserializer, u128 :: U128Deserializer);
);

proptest_integral!(
    Token::Number(u32);
    proptest_fit!(u8 :: U8Deserializer, u16 :: U16Deserializer);
    proptest_try_fit!(i8 :: I8Deserializer, i16 :: I16Deserializer, i32 :: I32Deserializer, i64 :: I64Deserializer, i128 :: I128Deserializer, u64 :: U64Deserializer, u128 :: U128Deserializer);
);

proptest_integral!(
    Token::Number(u64);
    proptest_fit!(u8 :: U8Deserializer, u16 :: U16Deserializer, u32 :: U32Deserializer);
    proptest_try_fit!(i8 :: I8Deserializer, i16 :: I16Deserializer, i32 :: I32Deserializer, i64 :: I64Deserializer, i128 :: I128Deserializer, u128 :: U128Deserializer);
);

// the code for pointer width 16, 32, 128 is pretty much the same, the tests only differ
// while we know that u32 and u64 will fit, there are no `From<T>` implementations, so we need
// to fall back to `proptest_try_fit!` which uses `TryFrom<T>`
// The reason we have no other use-cases for the other `target_pointer_width`s is because it is hard
// to emulate those during testing.
#[cfg(target_pointer_width = "64")]
proptest_integral!(
    Token::Number(usize as u64);
    proptest_fit!(u8 :: U8Deserializer, u16 :: U16Deserializer);
    proptest_try_fit!(i8 :: I8Deserializer, i16 :: I16Deserializer, i32 :: I32Deserializer, i64 :: I64Deserializer, u32 :: U32Deserializer, u64 :: U64Deserializer, i128 :: I128Deserializer, u128 :: U128Deserializer);
);

proptest_integral!(
    Token::U128(u128);
    proptest_fit!(u8 :: U8Deserializer, u16 :: U16Deserializer, u32 :: U32Deserializer, u64 :: U64Deserializer);
    proptest_try_fit!(i8 :: I8Deserializer, i16 :: I16Deserializer, i32 :: I32Deserializer, i64 :: I64Deserializer, i128 :: I128Deserializer);
);

proptest_integral!(
    Token::Number(i8);
    proptest_try_fit!(i16 :: I16Deserializer, i32 :: I32Deserializer, i64 :: I64Deserializer, i128 :: I128Deserializer, u8 :: U8Deserializer, u16 :: U16Deserializer, u32 :: U32Deserializer, u64 :: U64Deserializer, u128 :: U128Deserializer);
);

proptest_integral!(
    Token::Number(i16);
    proptest_fit!(i8 :: I8Deserializer);
    proptest_try_fit!(i32 :: I32Deserializer, i64 :: I64Deserializer, i128 :: I128Deserializer, u8 :: U8Deserializer, u16 :: U16Deserializer, u32 :: U32Deserializer, u64 :: U64Deserializer, u128 :: U128Deserializer);
);

proptest_integral!(
    Token::Number(i32);
    proptest_fit!(i8 :: I8Deserializer, i16 :: I16Deserializer);
    proptest_try_fit!(i64 :: I64Deserializer, i128 :: I128Deserializer, u8 :: U8Deserializer, u16 :: U16Deserializer, u32 :: U32Deserializer, u64 :: U64Deserializer, u128 :: U128Deserializer);
);

proptest_integral!(
    Token::Number(i64);
    proptest_fit!(i8 :: I8Deserializer, i16 :: I16Deserializer, i32 :: I32Deserializer);
    proptest_try_fit!(i128 :: I128Deserializer, u8 :: U8Deserializer, u16 :: U16Deserializer, u32 :: U32Deserializer, u64 :: U64Deserializer, u128 :: U128Deserializer);
);

// for reason of cfg guard please refer to `usize` tests
#[cfg(target_pointer_width = "64")]
proptest_integral!(
    Token::Number(isize as i64);
    proptest_fit!(i8 :: I8Deserializer, i16 :: I16Deserializer);
    proptest_try_fit!(i32 :: I32Deserializer, i64 :: I64Deserializer, i128 :: I128Deserializer, u8 :: U8Deserializer, u16 :: U16Deserializer, u32 :: U32Deserializer, u64 :: U64Deserializer, u128 :: U128Deserializer);
);

proptest_integral!(
    Token::I128(i128);
    proptest_fit!(i8 :: I8Deserializer, i16 :: I16Deserializer, i32 :: I32Deserializer, i64 :: I64Deserializer);
    proptest_try_fit!(u8 :: U8Deserializer, u16 :: U16Deserializer, u32 :: U32Deserializer, u64 :: U64Deserializer, u128 :: U128Deserializer);
);

// we're not testing the individual error messages, as those are tested at the
// respective error variants and are separate from the returned errors
macro_rules! test_overflow {
    ($ty:ident) => {
        paste::paste! {
            #[test]
            fn [<$ty:lower _err_overflow >]() {
                let overflow = $ty::MAX as i128 + 1;
                let overflow = Number::from_i128(overflow).expect("fits into number");

                assert_tokens_error::<$ty>(
                    &error! {
                        ns: "deer",
                        id: ["value"],
                        properties: {
                            "expected": $ty::reflection(),
                            "received": overflow,
                            "location": []
                        }
                    },
                    &[Token::Number(overflow)],
                )
            }

            #[test]
            fn [<$ty:lower _err_underflow >]() {
                let underflow = $ty::MIN as i128 - 1;
                let underflow = Number::from_i128(underflow).expect("fits into number");

                assert_tokens_error::<$ty>(
                    &error! {
                        ns: "deer",
                        id: ["value"],
                        properties: {
                            "expected": $ty::reflection(),
                            "received": underflow,
                            "location": []
                        }
                    },
                    &[Token::Number(underflow)],
                )
            }
        }
    };

    [$($ty:ident),* $(,)?] => {
        $(test_overflow!($ty);)*
    };
}

// TODO: test reflection
test_overflow![u8, i8, u16, i16, u32, i32, i64];

mod u64 {

    #[allow(clippy::wildcard_imports)]
    use super::*;

    #[test]
    fn overflow() {
        let overflow = i128::from(u64::MAX) + 1;

        assert_tokens_error::<u64>(
            &error! {
                ns: "deer",
                id: ["value"],
                properties: {
                    "expected": u64::reflection(),
                    "received": overflow,
                    "location": []
                }
            },
            &[Token::I128(overflow)],
        );
    }

    #[test]
    fn underflow() {
        let underflow = i128::from(u64::MIN) - 1;
        let underflow = Number::from_i128(underflow).expect("fits into number");

        assert_tokens_error::<u64>(
            &error! {
                ns: "deer",
                id: ["value"],
                properties: {
                    "expected": u64::reflection(),
                    "received": underflow,
                    "location": []
                }
            },
            &[Token::Number(underflow)],
        );
    }
}
