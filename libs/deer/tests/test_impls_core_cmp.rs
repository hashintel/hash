use core::cmp::{Ordering, Reverse};

use deer_desert::{assert_tokens, Token};
use proptest::prelude::*;

proptest! {
    #[test]
    fn reverse_ok(value in any::<u8>()) {
        assert_tokens(&Reverse(value), &[Token::Number(value.into())]);
    }
}

#[test]
fn ordering_less_ok() {
    assert_tokens(&Ordering::Less, &[Token::String("Less")]);
}

#[test]
fn ordering_equal_ok() {
    assert_tokens(&Ordering::Equal, &[Token::String("Equal")]);
}

#[test]
fn ordering_greater_ok() {
    assert_tokens(&Ordering::Greater, &[Token::String("Greater")]);
}
