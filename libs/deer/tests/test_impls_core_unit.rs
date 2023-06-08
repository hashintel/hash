use deer_desert::{assert_tokens, Token};

#[test]
fn unit_ok() {
    assert_tokens(&(), &[Token::Null]);
}
