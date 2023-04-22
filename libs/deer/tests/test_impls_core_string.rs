use deer_desert::{assert_tokens, Token};
use proptest::prelude::*;

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
