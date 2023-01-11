// These values use the same logic as integral, but zero is an error!

mod common;

use core::num::{
    NonZeroI128, NonZeroI16, NonZeroI32, NonZeroI64, NonZeroI8, NonZeroIsize, NonZeroU128,
    NonZeroU16, NonZeroU32, NonZeroU64, NonZeroU8, NonZeroUsize,
};

use deer::{Deserialize, Number};
use deer_desert::{assert_tokens, assert_tokens_error, Token};
use num_traits::cast::FromPrimitive;
use serde_json::json;

macro_rules! test_zero {
    ($ty:ident) => {
        paste::paste! {
            #[test]
            fn [<$ty:lower _err_zero >]() {
                let zero = Number::from(0u8);

                assert_tokens_error::<_, $ty>(
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
