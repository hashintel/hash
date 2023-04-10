use core::time::Duration;

use deer_desert::{assert_tokens, Token};
use proptest::prelude::*;

proptest! {
    #[test]
    fn duration_ok(value in any::<Duration>()) {
        let input = value.as_secs_f64();

        assert_tokens(&value, &[Token::Number(input.into())]);
    }
}
