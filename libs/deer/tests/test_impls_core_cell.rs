#[cfg(nightly)]
use core::cell::OnceCell;
use core::cell::{Cell, RefCell, UnsafeCell};

use deer::Number;
use deer_desert::{assert_tokens, Token};
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

    // #[test]
    // fn unsafe_cell_ok(value in any::<u8>()) {
    //     let expected = UnsafeCell::new(value);
    //
    //     assert_tokens(&expected, &[Token::Number(Number::from(value))]);
    // }

    #[cfg(nightly)]
    #[test]
    fn once_cell_ok(value in any::<u8>()) {
        let expected: OnceCell<_> = value.into();

        assert_tokens(&expected, &[Token::Number(Number::from(value))]);
    }

    // #[test]
    // fn sync_unsafe_cell_ok(value in any::<u8>()) {
    //     let expected = UnsafeCell::new(value);
    //
    //     assert_tokens(&expected, &[Token::Number(Number::from(value))]);
    // }
}
