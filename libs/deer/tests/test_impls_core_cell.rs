#![cfg_attr(nightly, feature(sync_unsafe_cell))]
use core::cell::{Cell, RefCell, UnsafeCell};
#[cfg(nightly)]
use core::cell::{OnceCell, SyncUnsafeCell};

use deer::{Deserialize as _, Number};
use deer_desert::{Token, assert_tokens, assert_tokens_with_assertion};
use proptest::prelude::*;
use serde::Serialize;
use similar_asserts::assert_serde_eq;

#[cfg(not(miri))]
proptest! {
    #[test]
    fn cell_ok(value in any::<u8>()) {
        let expected = Cell::new(value);

        assert_tokens(&expected, &[Token::Number(Number::from(value))]);
    }

    #[test]
    fn ref_cell_ok(value in any::<u8>()) {
        let expected = RefCell::new(value);

        assert_tokens(&expected, &[Token::Number(Number::from(value))]);
    }

    #[test]
    fn unsafe_cell_ok(value in any::<u8>()) {
        // need to use the underlying function, because `UnsafeCell` does not expose PartialEq
        assert_tokens_with_assertion(|mut received: UnsafeCell<u8>| {
            assert_eq!(*received.get_mut(), value);
        }, &[Token::Number(
            Number::from(value),
        )]);
    }


    #[cfg(nightly)]
    #[test]
    fn once_cell_ok(value in any::<u8>()) {
        let expected: OnceCell<_> = value.into();

        assert_tokens(&expected, &[Token::Number(Number::from(value))]);
    }

    #[cfg(nightly)]
    #[test]
    fn sync_unsafe_cell_ok(value in any::<u8>()) {
        // need to use the underlying function, because `SyncUnsafeCell` does not expose PartialEq
        assert_tokens_with_assertion(|mut received: SyncUnsafeCell<u8>| {
            assert_eq!(*received.get_mut(), value);
        }, &[Token::Number(
            Number::from(value),
        )]);
    }
}

fn assert_json(lhs: impl Serialize, rhs: impl Serialize) {
    let lhs = serde_json::to_value(lhs).expect("should be able to serialize lhs");
    let rhs = serde_json::to_value(rhs).expect("should be able to serialize rhs");

    assert_serde_eq!(lhs, rhs);
}

// test that the `Reflection` of all types are the same as their underlying type
#[test]
fn cell_reflection_same() {
    let lhs = Cell::<u8>::reflection();
    let rhs = u8::reflection();

    assert_json(lhs, rhs);
}

#[test]
fn ref_cell_reflection_same() {
    let lhs = RefCell::<u8>::reflection();
    let rhs = u8::reflection();

    assert_json(lhs, rhs);
}

#[test]
fn unsafe_cell_reflection_same() {
    let lhs = UnsafeCell::<u8>::reflection();
    let rhs = u8::reflection();

    assert_json(lhs, rhs);
}

#[cfg(nightly)]
#[test]
fn once_cell_reflection_same() {
    let lhs = OnceCell::<u8>::reflection();
    let rhs = u8::reflection();

    assert_json(lhs, rhs);
}

#[cfg(nightly)]
#[test]
fn sync_unsafe_cell_reflection_same() {
    let lhs = SyncUnsafeCell::<u8>::reflection();
    let rhs = u8::reflection();

    assert_json(lhs, rhs);
}
