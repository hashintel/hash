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

// we're not testing the individual error messages, as those are tested at the respective error
// variants and are separate from the returned errors
#[test]
fn u8_err_overflow() {
    assert_tokens_error::<_, u8>(
        &error! {
            ns: "deer",
            id: ["value"],
            properties: {
                "expected": u8::reflection(),
                "received": Number::from(256),
                "location": []
            }
        },
        &[Token::Number(Number::from(u8::MAX as u16 + 1))],
    );
}

// TODO: test reflection

#[test]
fn u8_err_underflow() {
    assert_tokens_error::<_, u8>(
        &error! {
            ns: "deer",
            id: ["value"],
            properties: {
                "expected": u8::reflection(),
                "received": Number::from(-1),
                "location": []
            }
        },
        &[Token::Number(Number::from(-1))],
    )
}
