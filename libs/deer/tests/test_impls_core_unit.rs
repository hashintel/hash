use deer_desert::{Token, assert_tokens};

#[test]
fn unit_ok() {
    assert_tokens(&(), &[Token::Null]);
}
