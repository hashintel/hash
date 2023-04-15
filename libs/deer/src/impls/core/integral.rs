use error_stack::{IntoReport, Report, Result, ResultExt};
use num_traits::ToPrimitive;

use crate::{
    error::{DeserializeError, ExpectedType, ReceivedValue, ValueError, Variant, VisitorError},
    Deserialize, Deserializer, Document, Number, Reflection, Schema, Visitor,
};

macro_rules! impl_num {
    (
        $primitive:ident:: $deserialize:ident; $($method:ident !($($val:ident:: $visit:ident),*);)*
    ) => {
        impl Reflection for $primitive {
            fn schema(_: &mut Document) -> Schema {
                Schema::new("integer")
                    .with("minimum", Self::MIN)
                    .with("maximum", Self::MAX)
            }
        }

        impl<'de> Deserialize<'de> for $primitive {
            type Reflection = Self;

            fn deserialize<D>(de: D) -> Result<Self, DeserializeError>
            where
                D: Deserializer<'de>,
            {
                struct PrimitiveVisitor;

                impl<'de> Visitor<'de> for PrimitiveVisitor {
                    type Value = $primitive;

                    fn expecting(&self) -> Document {
                        Self::Value::reflection()
                    }

                    $($($method!($val :: $visit);)*)*
                }

                de.$deserialize(PrimitiveVisitor).change_context(DeserializeError)
            }
        }
    };
}

macro_rules! num_self {
    ($primitive:ident:: $visit:ident) => {
        fn $visit(self, v: $primitive) -> Result<Self::Value, VisitorError> {
            Ok(v)
        }
    };
}

macro_rules! num_from {
    ($primitive:ident:: $visit:ident) => {
        fn $visit(self, v: $primitive) -> Result<Self::Value, VisitorError> {
            Ok(Self::Value::from(v))
        }
    };
}

macro_rules! num_try_from {
    ($primitive:ident:: $visit:ident) => {
        fn $visit(self, v: $primitive) -> Result<Self::Value, VisitorError> {
            Self::Value::try_from(v)
                .into_report()
                .change_context(ValueError.into_error())
                .attach(ExpectedType::new(self.expecting()))
                .attach(ReceivedValue::new(v))
                .change_context(VisitorError)
        }
    };
}

macro_rules! num_number {
    ($primitive:ident:: $to:ident) => {
        fn visit_number(self, v: Number) -> Result<Self::Value, VisitorError> {
            v.$to().ok_or_else(|| {
                Report::new(ValueError.into_error())
                    .attach(ExpectedType::new(self.expecting()))
                    .attach(ReceivedValue::new(v))
                    .change_context(VisitorError)
            })
        }
    };
}

impl_num!(
    u8::deserialize_u8;
    num_self!(u8::visit_u8);
    num_try_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32, i64::visit_i64, i128::visit_i128, u16::visit_u16, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(u8::to_u8);
);

impl_num!(
    u16::deserialize_u16;
    num_self!(u16::visit_u16);
    num_from!(u8::visit_u8);
    num_try_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32, i64::visit_i64, i128::visit_i128, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(u16::to_u16);
);

impl_num!(
    u32::deserialize_u32;
    num_self!(u32::visit_u32);
    num_from!(u8::visit_u8, u16::visit_u16);
    num_try_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32, i64::visit_i64, i128::visit_i128, u64::visit_u64, u128::visit_u128);
    num_number!(u32::to_u32);
);

impl_num!(
    u64::deserialize_u64;
    num_self!(u64::visit_u64);
    num_from!(u16::visit_u16, u32::visit_u32);
    num_try_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32, i64::visit_i64, i128::visit_i128, u128::visit_u128);
    num_number!(u64::to_u64);
);

impl_num!(
    u128::deserialize_u128;
    num_self!(u128::visit_u128);
    num_from!(u16::visit_u16, u32::visit_u32, u64::visit_u64);
    num_try_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32, i64::visit_i64, i128::visit_i128);
    num_number!(u128::to_u128);
);

impl_num!(
    i8::deserialize_i8;
    num_self!(i8::visit_i8);
    num_try_from!(i16::visit_i16, i32::visit_i32, i64::visit_i64, i128::visit_i128, u8::visit_u8, u16::visit_u16, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(i8::to_i8);
);

impl_num!(
    i16::deserialize_i16;
    num_self!(i16::visit_i16);
    num_from!(i8::visit_i8);
    num_try_from!(i32::visit_i32, i64::visit_i64, i128::visit_i128, u8::visit_u8, u16::visit_u16, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(i16::to_i16);
);

impl_num!(
    i32::deserialize_i32;
    num_self!(i32::visit_i32);
    num_from!(i8::visit_i8, i16::visit_i16);
    num_try_from!(i64::visit_i64, i128::visit_i128, u8::visit_u8, u16::visit_u16, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(i32::to_i32);
);

impl_num!(
    i64::deserialize_i64;
    num_self!(i64::visit_i64);
    num_from!(i8::visit_i8, i16::visit_i16, i32::visit_i32);
    num_try_from!(i128::visit_i128, u8::visit_u8, u16::visit_u16, u32::visit_u32, u64::visit_u64, u128::visit_u128);
    num_number!(i64::to_i64);
);

impl_num!(
    i128::deserialize_i64;
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
#[allow(clippy::cast_possible_truncation)]
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

    // #[cfg(target_pointer_width = "64")]
    // The default if not other architecture is chosen, should there every be a case of a usize that
    // has not the "default" pointer widths, even 128 is quite unlikely
    #[cfg(not(any(
        target_pointer_width = "16",
        target_pointer_width = "32",
        target_pointer_width = "128"
    )))]
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        u64::deserialize(de).map(|value| value as Self)
    }

    #[cfg(target_pointer_width = "128")]
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        u128::deserialize(de).map(|value| value as Self)
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
#[allow(clippy::cast_possible_truncation)]
impl<'de> Deserialize<'de> for isize {
    type Reflection = Self;

    #[cfg(target_pointer_width = "16")]
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        i16::deserialize(de).map(|value| value as Self)
    }

    #[cfg(target_pointer_width = "32")]
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        i32::deserialize(de).map(|value| value as Self)
    }

    // #[cfg(target_pointer_width = "64")]
    // The default if not other architecture is chosen, should there every be a case of a isize that
    // has not the "default" pointer widths, even 128 is quite unlikely
    #[cfg(not(any(
        target_pointer_width = "16",
        target_pointer_width = "32",
        target_pointer_width = "128"
    )))]
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        i64::deserialize(de).map(|value| value as Self)
    }

    #[cfg(target_pointer_width = "128")]
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        i128::deserialize(de).map(|value| value as Self)
    }
}
