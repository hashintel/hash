use error_stack::ResultExt;

use crate::{
    error::{DeserializeError, VisitorError},
    Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
};

macro_rules! impl_integral {
    (@num $name:ident, $visit:ident, $deser:ident, $typ:ty) => {
        struct $name;

        impl<'de> Visitor<'de> for $name {
            type Value = $typ;

            fn expecting(&self) -> Document {
                <$typ>::reflection()
            }

            fn $visit(self, value: $typ) -> error_stack::Result<Self::Value, VisitorError> {
                Ok(value)
            }
        }

        impl Reflection for $typ {
            fn schema(_: &mut Document) -> Schema {
                Schema::new("integer")
                    .with("minimum", <$typ>::MIN)
                    .with("maximum", <$typ>::MAX)
            }
        }

        impl<'de> Deserialize<'de> for $typ {
            type Reflection = Self;

            fn deserialize<D: Deserializer<'de>>(
                deserializer: D,
            ) -> error_stack::Result<Self, DeserializeError> {
                deserializer.$deser($name).change_context(DeserializeError)
            }
        }
    };

    ($($typ:ident:: $fun:ident() <- $name:ident. $visit:ident()),*$(,)?) => {
        $(impl_integral!(@num $name, $visit, $fun, $typ);)*
    };
}

// TODO: fit smaller values (visit) into them / try to fit them
impl_integral![
    u8::deserialize_u8() <- U8Visitor.visit_u8(),
    u16::deserialize_u16() <- U16Visitor.visit_u16(),
    u32::deserialize_u32() <- U32Visitor.visit_u32(),
    u64::deserialize_u64() <- U64Visitor.visit_u64(),
    u128::deserialize_u128() <- U128Visitor.visit_u128(),
    usize::deserialize_usize() <- USizeVisitor.visit_usize(),
];

impl_integral![
    i8::deserialize_i8() <- I8Visitor.visit_i8(),
    i16::deserialize_i16() <- I16Visitor.visit_i16(),
    i32::deserialize_i32() <- I32Visitor.visit_i32(),
    i64::deserialize_i64() <- I64Visitor.visit_i64(),
    i128::deserialize_i128() <- I128Visitor.visit_i128(),
    isize::deserialize_isize() <- ISizeVisitor.visit_isize(),
];
