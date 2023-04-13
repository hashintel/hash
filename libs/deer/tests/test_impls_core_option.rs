use deer_desert::{assert_tokens, Token};
use proptest::prelude::*;

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
