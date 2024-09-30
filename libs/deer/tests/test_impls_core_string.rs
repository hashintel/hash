use deer::Deserialize as _;
use deer_desert::{Token, assert_tokens, assert_tokens_error, error};
use proptest::prelude::*;
use serde_json::json;

#[cfg(not(miri))]
proptest! {
    #[test]
    fn char_ok(value in any::<char>()) {
        assert_tokens(&value, &[Token::Char(value)]);
    }
}

// we cannot use proptest here, because we cannot generate &'static str
#[test]
fn string_ok() {
    let value_str = "example";
    assert_tokens(&value_str, &[Token::BorrowedStr("example")]);
}

#[test]
fn single_char_str_ok() {
    assert_tokens(&'A', &[Token::BorrowedStr("A")]);
    assert_tokens(&'A', &[Token::Str("A")]);
    assert_tokens(&'A', &[Token::String("A")]);
}

#[test]
fn multiple_char_str_err() {
    assert_tokens_error::<char>(
        &error!([{
            ns: "deer",
            id: ["type"],
            properties: {
                "expected": char::reflection(),
                "received": <&str>::reflection(),
                "location": []
            }
        }]),
        &[Token::BorrowedStr("ABC")],
    );

    assert_tokens_error::<char>(
        &error!([{
            ns: "deer",
            id: ["type"],
            properties: {
                "expected": char::reflection(),
                "received": <&str>::reflection(),
                "location": []
            }
        }]),
        &[Token::Str("ABC")],
    );

    assert_tokens_error::<char>(
        &error!([{
            ns: "deer",
            id: ["type"],
            properties: {
                "expected": char::reflection(),
                "received": <&str>::reflection(),
                "location": []
            }
        }]),
        &[Token::String("ABC")],
    );
}
