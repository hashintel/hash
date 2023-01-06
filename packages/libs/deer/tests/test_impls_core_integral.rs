mod common;

use deer::{Deserialize, Number};
use deer_desert::{assert_tokens, assert_tokens_error, Token};
use proptest::prelude::*;
use serde_json::json;

use crate::common::Errors;

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

    // #[test]
    // fn u128_ok(value in any::<u128>()) {
    //     assert_tokens(&value, &[Token::Number(Number::from(value))]);
    // }
    //
    // #[test]
    // fn usize_ok(value in any::<usize>()) {
    //     assert_tokens(&value, &[Token::Number(Number::from(value))]);
    // }

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

    // #[test]
    // fn i128_ok(value in any::<i128>()) {
    //     assert_tokens(&value, &[Token::Number(Number::from(value))]);
    // }
    //
    // #[test]
    // fn isize_ok(value in any::<isize>()) {
    //     assert_tokens(&value, &[Token::Number(Number::from(value))]);
    // }

    #[test]
    fn f32_ok(value in any::<f32>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }

    #[test]
    fn f64_ok(value in any::<f64>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }
}

// TODO: we're not coercing down into number if possible :/ We might just end up with arbitrary
//  precision enabled?
//
// we're not testing the individual error messages, as those are tested at the
// respective error variants and are separate from the returned errors
macro_rules! test_overflow {
    ($ty:ident) => {
        mod $ty {
            use super::*;

            #[test]
            fn overflow() {
                let overflow = $ty::MAX as i128 + 1;

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
                    &[Token::I128(overflow)],
                )
            }

            #[test]
            fn underflow() {
                let underflow = $ty::MIN as i128 - 1;

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
                    &[Token::I128(underflow)],
                )
            }
        }
    };

    [$($ty:ident),* $(,)?] => {
        $(test_overflow!($ty);)*
    };
}

test_overflow![u8, i8, u16, i16, u32, i32, u64, i64];

// TODO: test reflection
