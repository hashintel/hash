use deer::Deserialize as _;
use deer_desert::{Token, assert_tokens, assert_tokens_any_error, assert_tokens_error, error};
use proptest::prelude::*;
use serde_json::json;

#[cfg(not(miri))]
proptest! {
    #[test]
    fn result_ok_ok(value in any::<u8>()) {
        let expected = Result::<u8, bool>::Ok(value);

        assert_tokens(&expected, &[
            Token::Object { length: Some(1) },
            Token::String("Ok"),
            Token::Number(value.into()),
            Token::ObjectEnd,
        ]);
    }

    #[test]
    fn result_ok_not_err(value in any::<bool>()) {
        _ = assert_tokens_any_error::<Result<u8, bool>>(&[
            Token::Object { length: Some(1) },
            Token::String("Ok"),
            Token::Bool(value),
            Token::ObjectEnd,
        ]);
    }

    #[test]
    fn result_err_ok(value in any::<bool>()) {
        let expected = Result::<u8, bool>::Err(value);

        assert_tokens(&expected, &[
            Token::Object { length: Some(1) },
            Token::String("Err"),
            Token::Bool(value),
            Token::ObjectEnd,
        ]);
    }

    #[test]
    fn result_err_not_ok(value in any::<u8>()) {
         _ = assert_tokens_any_error::<Result<u8, bool>>(&[
            Token::Object { length: Some(1) },
            Token::String("Err"),
            Token::Number(value.into()),
            Token::ObjectEnd,
        ]);
    }
}

#[test]
fn result_error_location() {
    assert_tokens_error::<Result<u8, ()>>(
        &error!([{
            ns: "deer",
            id: ["type"],
            properties: {
                "expected": u8::reflection(),
                "received": bool::reflection(),
                "location": [{"type": "variant", "value": "Ok"}]
            }
        }]),
        &[
            Token::Object { length: Some(1) },
            Token::String("Ok"),
            Token::Bool(true),
            Token::ObjectEnd,
        ],
    );
}
