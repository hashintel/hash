use core::time::Duration;

use approx::assert_relative_eq;
use deer_desert::{assert_tokens_with_assertion, Token};
use proptest::prelude::*;

proptest! {
    #[test]
    fn duration_ok(value in any::<Duration>()) {
        let input = value.as_secs_f64();

        assert_tokens_with_assertion(|received: Duration| {
            assert_relative_eq!(received.as_secs_f64(), value.as_secs_f64());
        }, &[Token::Number(input.into())]);
    }
}
