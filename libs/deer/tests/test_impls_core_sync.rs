#![feature(exclusive_wrapper)]
#![cfg(nightly)]

use core::sync::Exclusive;

use deer::{Deserialize as _, Number};
use deer_desert::{Token, assert_tokens_with_assertion};
use proptest::prelude::*;
use serde::Serialize;
use similar_asserts::assert_serde_eq;

#[cfg(not(miri))]
proptest! {
    #[test]
    fn exclusive_ok(value in any::<u8>()) {
        assert_tokens_with_assertion(|mut received: Exclusive<u8>| {
            assert_eq!(*received.get_mut(), value);
        }, &[Token::Number(Number::from(value))]);
    }
}

fn assert_json(lhs: impl Serialize, rhs: impl Serialize) {
    let lhs = serde_json::to_value(lhs).expect("should be able to serialize lhs");
    let rhs = serde_json::to_value(rhs).expect("should be able to serialize rhs");

    assert_serde_eq!(lhs, rhs);
}

// test that the `Reflection` of all types are the same as their underlying type
#[test]
fn exclusive_reflection_same() {
    let lhs = Exclusive::<u8>::reflection();
    let rhs = u8::reflection();

    assert_json(lhs, rhs);
}
