#![feature(sync_unsafe_cell)]
use core::cell::{Cell, RefCell, UnsafeCell};
#[cfg(nightly)]
use core::cell::{OnceCell, SyncUnsafeCell};

use deer::Number;
use deer_desert::{assert_tokens, assert_tokens_with_assertion, Token};
use proptest::prelude::*;

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
