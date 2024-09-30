use deer::Deserialize as _;
use deer_desert::{Token, assert_tokens, assert_tokens_error, error};
use proptest::prelude::*;
use serde_json::json;

#[cfg(not(miri))]
proptest! {
    #[test]
    fn option_some_ok(value in any::<u8>()) {
        assert_tokens(&Some(value), &[Token::Number(value.into())]);
    }
}

#[test]
fn option_none_ok() {
    assert_tokens(&None::<u8>, &[Token::Null]);
}

#[test]
fn option_error_location() {
    assert_tokens_error::<Option<u8>>(
        &error!([{
            ns: "deer",
            id: ["type"],
            properties: {
                "expected": u8::reflection(),
                "received": bool::reflection(),
                "location": [{"type": "variant", "value": "Some"}]
            }
        }]),
        &[Token::Bool(true)],
    );
}
