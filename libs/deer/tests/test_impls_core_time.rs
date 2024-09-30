#![expect(clippy::non_ascii_literal)]
use core::time::Duration;

use deer_desert::{Token, assert_tokens_with_assertion};
use proptest::prelude::*;

#[cfg(not(miri))]
proptest! {
    #[test]
    fn duration_ok(value in any::<Duration>()) {
        let input = value.as_secs_f64();

        #[expect(clippy::float_arithmetic)]
        assert_tokens_with_assertion(|received: Duration| {
            // due to the inherent imprecise nature of floats, we cannot use `assert_eq!`
            // instead we need to check if the difference between both values is <= ε
            // (which is the upper bound on the relative approximation error)
            assert!((received.as_secs_f64() - value.as_secs_f64()).abs() <= f64::EPSILON);
        }, &[Token::Number(input.into())]);
    }
}
