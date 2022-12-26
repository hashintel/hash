use deer::{Deserialize, Number};
use deer_desert::{assert_tokens, assert_tokens_error, Token};
use proptest::prelude::*;
use serde_json::json;

proptest! {
    #[test]
    fn u8_ok(value in any::<u8>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }
}

#[test]
fn u8_err_overflow() {
    assert_tokens_error::<u8>(
        &json!([{
            "id": ["value"],
            "message": "received value is of correct type (integer), but does not fit constraints",
            "namespace": "deer",
            "properties": {
                "expected": u8::reflection(),
                "received": 256,
                "location": []
            }
        }]),
        &[Token::Number(Number::from(u8::MAX as u16 + 1))],
    )
}

#[test]
fn u8_err_underflow() {
    assert_tokens_error::<u8>(
        &json!([{
            "id": ["value"],
            "message": "received value is of correct type (integer), but does not fit constraints",
            "namespace": "deer",
            "properties": {
                "expected": u8::reflection(),
                "received": -1,
                "location": []
            }
        }]),
        &[Token::Number(Number::from(-1))],
    )
}
