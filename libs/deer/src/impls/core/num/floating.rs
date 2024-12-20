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
                Schema::new("number")
            }
        }
    };
}

impl_num!(
    f32::deserialize_f32;
    impl_reflection;
    num_self!(f32::visit_f32);
    num_from!(i8::visit_i8, i16::visit_i16, u8::visit_u8, u16::visit_u16);
    num_number!(f32::to_f32);
    num_as_lossy!(f64::visit_f64, i32::visit_i32, i64::visit_i64, i128::visit_i128, u32::visit_u32, u64::visit_u64, u128::visit_u128);
);

impl_num!(
    f64::deserialize_f64;
    impl_reflection;
    num_self!(f64::visit_f64);
    num_from!(f32::visit_f32, i8::visit_i8, i16::visit_i16, i32::visit_i32, u8::visit_u8, u16::visit_u16, u32::visit_u32);
    num_number!(f64::to_f64);
    num_as_lossy!(i64::visit_i64, i128::visit_i128, u64::visit_u64, u128::visit_u128);
);
