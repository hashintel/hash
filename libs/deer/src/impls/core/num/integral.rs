use error_stack::{Report, ResultExt as _};
use num_traits::ToPrimitive as _;

use crate::{
    Deserialize, Deserializer, Document, Number, Reflection, Schema, Visitor,
    error::{
        DeserializeError, ExpectedType, ReceivedValue, ValueError, Variant as _, VisitorError,
    },
};

macro_rules! impl_reflection {
    ($primitive:ident) => {
        impl Reflection for $primitive {
            fn schema(_: &mut Document) -> Schema {
                Schema::new("integer")
                    .with("minimum", Self::MIN)
                    .with("maximum", Self::MAX)
            }
        }
    };
}

impl_num!(
    u8::deserialize_u8;
    impl_reflection;
    num_self!(u8::visit_u8);
    num_try_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32, i64::visit_i64, i128::visit_i128, u16::visit_u16, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(u8::to_u8);
);

impl_num!(
    u16::deserialize_u16;
    impl_reflection;
    num_self!(u16::visit_u16);
    num_from!(u8::visit_u8);
    num_try_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32, i64::visit_i64, i128::visit_i128, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(u16::to_u16);
);

impl_num!(
    u32::deserialize_u32;
    impl_reflection;
    num_self!(u32::visit_u32);
    num_from!(u8::visit_u8, u16::visit_u16);
    num_try_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32, i64::visit_i64, i128::visit_i128, u64::visit_u64, u128::visit_u128);
    num_number!(u32::to_u32);
);

impl_num!(
    u64::deserialize_u64;
    impl_reflection;
    num_self!(u64::visit_u64);
    num_from!(u8::visit_u8, u16::visit_u16, u32::visit_u32);
    num_try_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32, i64::visit_i64, i128::visit_i128, u128::visit_u128);
    num_number!(u64::to_u64);
);

impl_num!(
    u128::deserialize_u128;
    impl_reflection;
    num_self!(u128::visit_u128);
    num_from!(u8::visit_u8, u16::visit_u16, u32::visit_u32, u64::visit_u64);
    num_try_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32, i64::visit_i64, i128::visit_i128);
    num_number!(u128::to_u128);
);

impl_num!(
    i8::deserialize_i8;
    impl_reflection;
    num_self!(i8::visit_i8);
    num_try_from!(i16::visit_i16, i32::visit_i32, i64::visit_i64, i128::visit_i128, u8::visit_u8, u16::visit_u16, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(i8::to_i8);
);

impl_num!(
    i16::deserialize_i16;
    impl_reflection;
    num_self!(i16::visit_i16);
    num_from!(i8::visit_i8);
    num_try_from!(i32::visit_i32, i64::visit_i64, i128::visit_i128, u8::visit_u8, u16::visit_u16, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(i16::to_i16);
);

impl_num!(
    i32::deserialize_i32;
    impl_reflection;
    num_self!(i32::visit_i32);
    num_from!(i8::visit_i8, i16::visit_i16);
    num_try_from!(i64::visit_i64, i128::visit_i128, u8::visit_u8, u16::visit_u16, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(i32::to_i32);
);

impl_num!(
    i64::deserialize_i64;
    impl_reflection;
    num_self!(i64::visit_i64);
    num_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32);
    num_try_from!(i128::visit_i128, u8::visit_u8, u16::visit_u16, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(i64::to_i64);
);

impl_num!(
    i128::deserialize_i128;
    impl_reflection;
    num_self!(i128::visit_i128);
    num_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32, i64::visit_i64);
    num_try_from!(u8::visit_u8, u16::visit_u16, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(i128::to_i128);
);

impl Reflection for usize {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("integer")
            .with("minimum", Self::MIN)
            .with("maximum", Self::MAX)
    }
}

// Reason: code is architecture dependent, therefore truncation is not possible
#[expect(clippy::cast_possible_truncation)]
impl<'de> Deserialize<'de> for usize {
    type Reflection = Self;

    #[cfg(target_pointer_width = "16")]
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        u16::deserialize(de).map(|value| value as Self)
    }

    #[cfg(target_pointer_width = "32")]
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        u32::deserialize(de).map(|value| value as Self)
    }

    #[cfg(target_pointer_width = "64")]
    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        u64::deserialize(deserializer).map(|value| value as Self)
    }
}

impl Reflection for isize {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("integer")
            .with("minimum", Self::MIN)
            .with("maximum", Self::MAX)
    }
}

// Reason: code is architecture dependent, therefore truncation is not possible
#[expect(clippy::cast_possible_truncation)]
impl<'de> Deserialize<'de> for isize {
    type Reflection = Self;

    #[cfg(target_pointer_width = "16")]
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, DeserializeError> {
        i16::deserialize(deserializer).map(|value| value as Self)
    }

    #[cfg(target_pointer_width = "32")]
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, DeserializeError> {
        i32::deserialize(deserializer).map(|value| value as Self)
    }

    #[cfg(target_pointer_width = "64")]
    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        i64::deserialize(deserializer).map(|value| value as Self)
    }
}
