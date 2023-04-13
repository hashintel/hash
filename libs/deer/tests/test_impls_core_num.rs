#![cfg_attr(nightly, feature(saturating_int_impl))]

#[cfg(nightly)]
use core::num::Saturating;
use core::num::Wrapping;

use deer_desert::assert_tokens;
use proptest::prelude::*;

mod common;

use core::num::{
    NonZeroI128, NonZeroI16, NonZeroI32, NonZeroI64, NonZeroI8, NonZeroIsize, NonZeroU128,
    NonZeroU16, NonZeroU32, NonZeroU64, NonZeroU8, NonZeroUsize,
};

use deer::{Deserialize, Number};
use deer_desert::{assert_tokens_error, error, Token};
use serde::Serialize;
use serde_json::json;
use similar_asserts::assert_serde_eq;

// These values use the same logic as integral, but zero is an error!
macro_rules! test_zero {
    ($ty:ident) => {
        paste::paste! {
            #[test]
            fn [<$ty:lower _err_zero >]() {
                let zero = Number::from(0u8);

                assert_tokens_error::<$ty>(
                    &error! {
                        ns: "deer",
                        id: ["value"],
                        properties: {
                            "expected": $ty::reflection(),
                            "received": 0,
                            "location": []
                        }
                    },
                    &[Token::Number(zero)],
                )
            }
        }
    };

    [$($ty:ident),* $(,)?] => {
        $(test_zero!($ty);)*
    };
}

test_zero![
    NonZeroU8, NonZeroU16, NonZeroU32, NonZeroU64, NonZeroI8, NonZeroI16, NonZeroI32, NonZeroI64,
];

#[test]
fn i128_err_zero() {
    assert_tokens_error::<NonZeroI128>(
        &error! {
            ns: "deer",
            id: ["value"],
            properties: {
                "expected": NonZeroI128::reflection(),
                "received": 0,
                "location": []
            }
        },
        &[Token::I128(0)],
    );
}

#[test]
fn isize_err_zero() {
    assert_tokens_error::<NonZeroIsize>(
        &error! {
            ns: "deer",
            id: ["value"],
            properties: {
                "expected": NonZeroIsize::reflection(),
                "received": 0,
                "location": []
            }
        },
        &[Token::ISize(0)],
    );
}

#[test]
fn u128_err_zero() {
    assert_tokens_error::<NonZeroU128>(
        &error! {
            ns: "deer",
            id: ["value"],
            properties: {
                "expected": NonZeroU128::reflection(),
                "received": 0,
                "location": []
            }
        },
        &[Token::U128(0)],
    );
}

#[test]
fn usize_err_zero() {
    assert_tokens_error::<NonZeroUsize>(
        &error! {
            ns: "deer",
            id: ["value"],
            properties: {
                "expected": NonZeroUsize::reflection(),
                "received": 0,
                "location": []
            }
        },
        &[Token::USize(0)],
    );
}

#[cfg(not(miri))]
proptest! {
    #[test]
    fn wrapping_ok(value in any::<u8>()) {
        let expected = Wrapping(value);

        assert_tokens(&expected, &[Token::Number(Number::from(value))]);
    }

    #[cfg(nightly)]
    #[test]
    fn saturating_ok(value in any::<u8>()) {
        let expected = Saturating(value);

        assert_tokens(&expected, &[Token::Number(Number::from(value))]);
    }
}

fn assert_json(lhs: impl Serialize, rhs: impl Serialize) {
    let lhs = serde_json::to_value(lhs).expect("should be able to serialize lhs");
    let rhs = serde_json::to_value(rhs).expect("should be able to serialize rhs");

    assert_serde_eq!(lhs, rhs);
}

// test that the `Reflection` of all types are the same as their underlying type
#[test]
fn wrapping_reflection_same() {
    let lhs = Wrapping::<u8>::reflection();
    let rhs = u8::reflection();

    assert_json(lhs, rhs);
}

#[cfg(nightly)]
#[test]
fn saturating_reflection_same() {
    let lhs = Saturating::<u8>::reflection();
    let rhs = u8::reflection();

    assert_json(lhs, rhs);
}
