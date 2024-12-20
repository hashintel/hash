use core::mem::ManuallyDrop;

use deer::Deserialize as _;
use deer_desert::{Token, assert_tokens};
use proptest::prelude::*;
use serde::Serialize;
use similar_asserts::assert_serde_eq;

#[cfg(not(miri))]
proptest! {
    #[test]
    fn manually_drop_ok(value in any::<u8>()) {
        assert_tokens(&ManuallyDrop::new(value), &[Token::Number(value.into())]);
    }
}

fn assert_json(lhs: impl Serialize, rhs: impl Serialize) {
    let lhs = serde_json::to_value(lhs).expect("should be able to serialize lhs");
    let rhs = serde_json::to_value(rhs).expect("should be able to serialize rhs");

    assert_serde_eq!(lhs, rhs);
}

// test that the `Reflection` of all types are the same as their underlying type
#[test]
fn manually_drop_reflection_same() {
    let lhs = ManuallyDrop::<u8>::reflection();
    let rhs = u8::reflection();

    assert_json(lhs, rhs);
}
