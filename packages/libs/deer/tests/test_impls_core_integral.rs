use deer::Number;
use deer_desert::{assert_tokens, Token};

#[test]
fn u8_ok() {
    assert_tokens(&0, &[Token::Number(Number::from(0u8))]);
}

#[test]
fn u8_err_overflow() {}

#[test]
fn u8_err_underflow() {}
