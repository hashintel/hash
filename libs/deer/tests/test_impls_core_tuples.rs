use deer::Deserialize as _;
use deer_desert::{Token, assert_tokens, assert_tokens_error, error};
use proptest::prelude::*;
use seq_macro::seq;
use serde_json::json;

#[rustfmt::skip]
macro_rules! all_the_tuples {
    ($name:ident) => {
        $name!( 1, u8);
        $name!( 2, u8, u16);
        $name!( 3, u8, u16, u32);
        $name!( 4, u8, u16, u32, u64);
        $name!( 5, u8, u16, u32, u64, f32);
        $name!( 6, u8, u16, u32, u64, f32, f64);
        $name!( 7, u8, u16, u32, u64, f32, f64, i8);
        $name!( 8, u8, u16, u32, u64, f32, f64, i8, i16);
        $name!( 9, u8, u16, u32, u64, f32, f64, i8, i16, i32);

        // Tuples larger than 9 elements are not supported by proptest, but because the
        // code generated for each variant is pretty much the same we can assume that those are
        // also ok. In the future we might want to test them with a more sophisticated macro.
        // $name!(10, u8, u16, u32, u64, f32, f64, i8, i16, i32, i64);
        // $name!(11, u8, u16, u32, u64, f32, f64, i8, i16, i32, i64, u8);
        // $name!(12, u8, u16, u32, u64, f32, f64, i8, i16, i32, i64, u8, u16);
        // $name!(13, u8, u16, u32, u64, f32, f64, i8, i16, i32, i64, u8, u16, u32);
        // $name!(14, u8, u16, u32, u64, f32, f64, i8, i16, i32, i64, u8, u16, u32, u64);
        // $name!(15, u8, u16, u32, u64, f32, f64, i8, i16, i32, i64, u8, u16, u32, u64, f32);
        // $name!(16, u8, u16, u32, u64, f32, f64, i8, i16, i32, i64, u8, u16, u32, u64, f32, f64);
    };
}

macro_rules! impl_test_case {
    ($length:literal, $($types:ty),*) => {
        paste::paste! {
            #[cfg(not(miri))]
            proptest! {
                #[test]
                fn [< tuple $length _ok >](value in any::<($($types,)*)>()) {
                    seq!(N in 0..$length {
                        let stream = [
                            Token::Array {length: Some($length)},
                            #(Token::Number(value.N.into()),)*
                            Token::ArrayEnd,
                        ];
                    });

                    assert_tokens(&value, &stream);
                }
            }
        }
    };
}

all_the_tuples!(impl_test_case);

#[test]
fn tuple_insufficient_length_err() {
    assert_tokens_error::<(u8, u16)>(
        &error!([{
            ns: "deer",
            id: ["value", "missing"],
            properties: {
                "expected": u16::reflection(),
                "location": [{"type": "tuple", "value": 1}]
            }
        }]),
        &[
            Token::Array { length: Some(1) },
            Token::Number(12.into()),
            Token::ArrayEnd,
        ],
    );
}

#[test]
fn tuple_too_many_items_err() {
    assert_tokens_error::<(u8, u16)>(
        &error!([{
            ns: "deer",
            id: ["array", "length"],
            properties: {
                "expected": 2,
                "received": 3,
                "location": []
            }
        }]),
        &[
            Token::Array { length: Some(3) },
            Token::Number(12.into()),
            Token::Number(13.into()),
            Token::Number(14.into()),
            Token::ArrayEnd,
        ],
    );
}

#[test]
fn tuple_fallback_to_default_ok() {
    assert_tokens(
        &(Some(12_u8), None::<u16>),
        &[
            Token::Array { length: Some(1) },
            Token::Number(12.into()),
            Token::ArrayEnd,
        ],
    );
}
