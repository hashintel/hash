mod common;

use deer::{Deserialize as _, Number};
use deer_desert::{Token, assert_tokens, assert_tokens_error, error};
use serde_json::json;

#[test]
fn array_u8_ok() {
    let array = [0_u8, 1, 2, 3, 4, 5, 6, 7];

    assert_tokens(
        &array,
        &[
            Token::Array { length: Some(8) },
            Token::Number(Number::from(0)),
            Token::Number(Number::from(1)),
            Token::Number(Number::from(2)),
            Token::Number(Number::from(3)),
            Token::Number(Number::from(4)),
            Token::Number(Number::from(5)),
            Token::Number(Number::from(6)),
            Token::Number(Number::from(7)),
            Token::ArrayEnd,
        ],
    );
}

#[test]
fn array_u8_err_inner() {
    assert_tokens_error::<[u8; 8]>(
        &error! {
            ns: "deer",
            id: ["value"],
            properties: {
                "expected": u8::reflection(),
                "received": 256,
                "location": [{
                    "type": "array",
                    "value": 4
                }]
            }
        },
        &[
            Token::Array { length: Some(8) },
            Token::Number(Number::from(0)),
            Token::Number(Number::from(1)),
            Token::Number(Number::from(2)),
            Token::Number(Number::from(3)),
            Token::Number(Number::from(256)),
            Token::Number(Number::from(5)),
            Token::Number(Number::from(6)),
            Token::Number(Number::from(7)),
            Token::ArrayEnd,
        ],
    );
}

#[test]
fn array_u8_err_too_many() {
    assert_tokens_error::<[u8; 1]>(
        &error! {
            ns: "deer",
            id: ["array", "length"],
            properties: {
                "expected": 1,
                "received": 2,
                "location": []
            }
        },
        &[
            Token::Array { length: Some(2) },
            Token::Number(Number::from(0)),
            Token::Number(Number::from(1)),
            Token::ArrayEnd,
        ],
    );
}

#[test]
fn array_u8_err_not_enough() {
    assert_tokens_error::<[u8; 3]>(
        &error!([
            {
                ns: "deer",
                id: ["value", "missing"],
                properties: {
                    "expected": u8::reflection(),
                    "location": [{
                        "type": "array",
                        "value": 2
                    }]
                }
            },
            {
                ns: "deer",
                id: ["array", "length"],
                properties: {
                    "expected": 3,
                    "received": 2,
                    "location": []
                }
            }
        ]),
        &[
            Token::Array { length: Some(2) },
            Token::Number(Number::from(0)),
            Token::Number(Number::from(1)),
            Token::ArrayEnd,
        ],
    );
}
