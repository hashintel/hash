mod common;

use deer::{Deserialize, Number};
use deer_desert::{assert_tokens, assert_tokens_error, Token};
use num_traits::cast::FromPrimitive;
use proptest::prelude::*;
use serde_json::json;

// we do not test atomics, as they only delegate to `Atomic*` and are not `PartialEq`

proptest! {
    #[test]
    fn u8_ok(value in any::<u8>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }

    #[test]
    fn u16_ok(value in any::<u16>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }

    #[test]
    fn u32_ok(value in any::<u32>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }

    #[test]
    fn u64_ok(value in any::<u64>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }

    #[test]
    fn u128_ok(value in any::<u128>()) {
        assert_tokens(&value, &[Token::U128(value)]);
    }

    #[test]
    fn usize_ok(value in any::<usize>()) {
        assert_tokens(&value, &[Token::USize(value)]);
    }

    #[test]
    fn i8_ok(value in any::<i8>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }

    #[test]
    fn i16_ok(value in any::<i16>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }

    #[test]
    fn i32_ok(value in any::<i32>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }

    #[test]
    fn i64_ok(value in any::<i64>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }

    #[test]
    fn i128_ok(value in any::<i128>()) {
        assert_tokens(&value, &[Token::I128(value)]);
    }

    #[test]
    fn isize_ok(value in any::<isize>()) {
        assert_tokens(&value, &[Token::ISize(value)]);
    }
}

// TODO: we're not coercing down into number if possible :/ We might just end up with arbitrary
//  precision enabled?
//
// we're not testing the individual error messages, as those are tested at the
// respective error variants and are separate from the returned errors
macro_rules! test_overflow {
    ($ty:ident) => {
        paste::paste! {
            #[test]
            fn [<$ty:lower _err_overflow >]() {
                let overflow = $ty::MAX as i128 + 1;
                let overflow = Number::from_i128(overflow).expect("fits into number");

                assert_tokens_error::<_, $ty>(
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

                assert_tokens_error::<_, $ty>(
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
    use super::*;

    #[test]
    fn overflow() {
        let overflow = u64::MAX as i128 + 1;

        assert_tokens_error::<_, u64>(
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
        )
    }

    #[test]
    fn underflow() {
        let underflow = u64::MIN as i128 - 1;
        let underflow = Number::from_i128(underflow).expect("fits into number");

        assert_tokens_error::<_, u64>(
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
        )
    }
}
