use deer_desert::{assert_tokens, Token};

mod common;

#[test]
fn bool_true_ok() {
    assert_tokens(&true, &[Token::Bool(true)]);
}

#[test]
fn bool_false_ok() {
    assert_tokens(&false, &[Token::Bool(false)]);
}
