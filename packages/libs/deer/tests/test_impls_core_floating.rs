use deer::Number;
use deer_desert::{assert_tokens, Token};
use proptest::prelude::*;

proptest! {
    #[test]
    fn f32_ok(value in any::<f32>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }

    #[test]
    fn f64_ok(value in any::<f64>()) {
        assert_tokens(&value, &[Token::Number(Number::from(value))]);
    }
}
