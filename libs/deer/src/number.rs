#[cfg(all(not(feature = "std"), feature = "arbitrary-precision"))]
use alloc::string::{String, ToString};
use core::fmt::{Display, Formatter};
#[cfg(not(feature = "arbitrary-precision"))]
use core::ops::Neg;

use error_stack::{Report, ResultExt as _};
use num_traits::{FromPrimitive, ToPrimitive};
use serde::{Serialize, Serializer};

use crate::{
    Deserialize, Deserializer, Document, Reflection, Schema,
    error::{DeserializeError, VisitorError},
};

// This indirection helps us to "disguise" the underlying storage, enabling us to seamlessly convert
// and change the underlying storage at a later point in time, if required.
#[cfg(not(feature = "arbitrary-precision"))]
#[derive(Debug, Copy, Clone, PartialEq)]
enum OpaqueNumber {
    PosInt(u64),
    NegInt(u64),
    Float(f64),
}

#[cfg(feature = "arbitrary-precision")]
type OpaqueNumber = String;

/// Used to represent any rational number.
///
/// This type simplifies the use of numbers internally and the implementation of custom
/// [`Deserializer`]s, as one only needs to convert to [`Number`], instead of converting to every
/// single primitive possible.
///
/// This type also enables easy coercion of values at deserialization time.
///
/// Without the `arbitrary-precision` feature enabled, integers are limited to `i64`, while floats
/// are stored as `f64`, larger values are only supported using the aforementioned feature, where
/// every value is stored as a `String` instead.
///
/// [`Deserializer`]: crate::Deserializer
// Reason: `Eq` can only be derived for `arbitrary-precision`, this would lead to unexpected results
// for library consumers and is therefore allowed.
#[cfg_attr(
    feature = "arbitrary-precision",
    allow(clippy::derive_partial_eq_without_eq)
)]
#[derive(Debug, Clone, PartialEq)]
pub struct Number(OpaqueNumber);

impl Number {
    #[cfg(not(feature = "arbitrary-precision"))]
    fn pos(n: impl Into<u64>) -> Self {
        Self(OpaqueNumber::PosInt(n.into()))
    }

    #[cfg(not(feature = "arbitrary-precision"))]
    fn neg(n: impl Into<u64>) -> Self {
        Self(OpaqueNumber::NegInt(n.into()))
    }

    #[cfg(not(feature = "arbitrary-precision"))]
    const fn float(n: f64) -> Self {
        Self(OpaqueNumber::Float(n))
    }

    /// # Safety
    ///
    /// The caller must verify that the value is a string of a valid integer or floating point
    /// number, otherwise the [`Number`] returned from this function will lead to undefined
    /// behaviour.
    #[cfg(feature = "arbitrary-precision")]
    #[expect(unsafe_code)]
    pub unsafe fn from_string_unchecked(value: impl Into<String>) -> Self {
        Self(value.into())
    }
}

impl FromPrimitive for Number {
    #[cfg(not(feature = "arbitrary-precision"))]
    fn from_isize(n: isize) -> Option<Self> {
        if let Ok(n) = u64::try_from(n) {
            return Some(Self::pos(n));
        } else if let Ok(n) = i64::try_from(n) {
            // the value previously didn't fit into u64, therefore we can assume that the value will
            // is negative
            return Some(Self::neg(n.unsigned_abs()));
        } else if let Ok(n) = i128::try_from(n) {
            // this is not guaranteed to be negative, but there's a single bit (sign bit) which is
            // unused in `i64`, but available in `u64`, and we don't want to waste single bits!
            if n.is_negative() {
                if let Ok(n) = u64::try_from(n.unsigned_abs()) {
                    return Some(Self::neg(n));
                }
            }
        }

        None
    }

    #[cfg(feature = "arbitrary-precision")]
    fn from_isize(n: isize) -> Option<Self> {
        Some(Self(n.to_string()))
    }

    #[cfg(not(feature = "arbitrary-precision"))]
    fn from_i64(n: i64) -> Option<Self> {
        Some(u64::try_from(n).ok().map_or_else(
            // the number is guaranteed to be negative, because the positive numbers of `i64`
            // are a subset of all numbers representable by `u64`
            || Self::neg(n.unsigned_abs()),
            // the number is guaranteed to be positive
            Self::pos,
        ))
    }

    #[cfg(feature = "arbitrary-precision")]
    fn from_i64(n: i64) -> Option<Self> {
        Some(Self(n.to_string()))
    }

    #[cfg(not(feature = "arbitrary-precision"))]
    fn from_i128(n: i128) -> Option<Self> {
        // `i128` numbers are not fully representable in our number type, we only support the first
        // 64 bits in either negative or positive direction.
        // `i128` and `u128` values are unlikely to be used and are mostly covered by `u64`
        // (positive and negative), if they are needed one can use the `arbitrary-precision`
        // feature. This library should also be able to be used in no-std environments, where the
        // difference between 8 bytes vs 16 bytes per number might be significant.

        if let Ok(n) = u64::try_from(n) {
            return Some(Self::pos(n));
        } else if let Ok(n) = u64::try_from(n.unsigned_abs()) {
            // we do not need to check if the value already is negative, because the previous if
            // statement covers the complete range of `u64`, therefore only negative values or
            // values greater than `u64::MAX` are left, this means that if we `abs` all values the
            // values left in the range of `u64` are negative and therefore we're able to
            // ensure that the `try_from` will only cover negative values
            return Some(Self::neg(n));
        }

        None
    }

    #[cfg(feature = "arbitrary-precision")]
    fn from_i128(n: i128) -> Option<Self> {
        Some(Self(n.to_string()))
    }

    #[cfg(not(feature = "arbitrary-precision"))]
    fn from_usize(n: usize) -> Option<Self> {
        u64::try_from(n).map(Self::pos).ok()
    }

    #[cfg(feature = "arbitrary-precision")]
    fn from_usize(n: usize) -> Option<Self> {
        Some(Self(n.to_string()))
    }

    #[cfg(not(feature = "arbitrary-precision"))]
    fn from_u64(n: u64) -> Option<Self> {
        Some(Self::pos(n))
    }

    #[cfg(feature = "arbitrary-precision")]
    fn from_u64(n: u64) -> Option<Self> {
        Some(Self(n.to_string()))
    }

    #[cfg(not(feature = "arbitrary-precision"))]
    fn from_u128(n: u128) -> Option<Self> {
        // for a detailed explanation why `u128` cannot be fully translated into the number type
        // refer to the comments in `i128`
        u64::try_from(n).map(Self::pos).ok()
    }

    #[cfg(feature = "arbitrary-precision")]
    fn from_u128(n: u128) -> Option<Self> {
        Some(Self(n.to_string()))
    }

    #[cfg(not(feature = "arbitrary-precision"))]
    fn from_f64(n: f64) -> Option<Self> {
        Some(Self::float(n))
    }

    #[cfg(feature = "arbitrary-precision")]
    fn from_f64(n: f64) -> Option<Self> {
        Some(Self(n.to_string()))
    }
}

impl ToPrimitive for Number {
    #[cfg(not(feature = "arbitrary-precision"))]
    fn to_isize(&self) -> Option<isize> {
        match self.0 {
            OpaqueNumber::PosInt(int) => isize::try_from(int).ok(),
            OpaqueNumber::NegInt(int) => isize::try_from(int).ok().map(Neg::neg),
            OpaqueNumber::Float(_) => None,
        }
    }

    #[cfg(feature = "arbitrary-precision")]
    fn to_isize(&self) -> Option<isize> {
        self.0.parse().ok()
    }

    #[cfg(not(feature = "arbitrary-precision"))]
    fn to_i64(&self) -> Option<i64> {
        // we cannot guarantee that post neg and pos ints actually fit into i64, as they both take a
        // single bit more, we therefore convert both first to i64 (or at least try to) and then
        // negate the negative numbers
        match self.0 {
            OpaqueNumber::PosInt(int) => i64::try_from(int).ok(),
            OpaqueNumber::NegInt(int) => i64::try_from(int).ok().map(Neg::neg),
            OpaqueNumber::Float(_) => None,
        }
    }

    #[cfg(feature = "arbitrary-precision")]
    fn to_i64(&self) -> Option<i64> {
        self.0.parse().ok()
    }

    #[cfg(not(feature = "arbitrary-precision"))]
    fn to_i128(&self) -> Option<i128> {
        // this is manually implemented, because `Number` actually saves more than `i64` for
        // negative values, therefore the default implementation (which just defers to `i64` is
        // inadequate)

        match self.0 {
            OpaqueNumber::PosInt(int) => Some(i128::from(int)),
            OpaqueNumber::NegInt(int) => Some(-i128::from(int)),
            OpaqueNumber::Float(_) => None,
        }
    }

    #[cfg(feature = "arbitrary-precision")]
    fn to_i128(&self) -> Option<i128> {
        self.0.parse().ok()
    }

    #[cfg(not(feature = "arbitrary-precision"))]
    fn to_u64(&self) -> Option<u64> {
        if let Self(OpaqueNumber::PosInt(n)) = self {
            Some(*n)
        } else {
            None
        }
    }

    #[cfg(feature = "arbitrary-precision")]
    fn to_u64(&self) -> Option<u64> {
        self.0.parse().ok()
    }

    #[cfg(feature = "arbitrary-precision")]
    fn to_usize(&self) -> Option<usize> {
        self.0.parse().ok()
    }

    // while we can delegate to the default implementation of u64 for non arbitrary precision (we
    // can only represent values in u64, which are fully contained in u128), we do not have the same
    // guarantee when we only have a `String` as the inner type.
    #[cfg(feature = "arbitrary-precision")]
    fn to_u128(&self) -> Option<u128> {
        self.0.parse().ok()
    }

    #[cfg(not(feature = "arbitrary-precision"))]
    fn to_f64(&self) -> Option<f64> {
        if let Self(OpaqueNumber::Float(float)) = self {
            Some(*float)
        } else {
            None
        }
    }

    #[cfg(feature = "arbitrary-precision")]
    fn to_f64(&self) -> Option<f64> {
        self.0.parse().ok()
    }
}

macro_rules! impl_from {
    (#internal, $t:ty, $func:ident) => {
        impl From<$t> for Number {
            fn from(value: $t) -> Self {
                // unwrap here is okay, as this **always** returns `Some`
                Self::$func(value).unwrap()
            }
        }
    };

    ($($t:ty: $func:ident),*) => {
        $(impl_from!(#internal, $t, $func);)*
    }
}

impl_from! {
    i8: from_i8,
    i16: from_i16,
    i32: from_i32,
    i64: from_i64,
    u8: from_u8,
    u16: from_u16,
    u32: from_u32,
    u64: from_u64,
    f32: from_f32,
    f64: from_f64
}

impl Display for Number {
    #[cfg(not(feature = "arbitrary-precision"))]
    fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
        match &self.0 {
            OpaqueNumber::PosInt(pos) => Display::fmt(pos, fmt),
            OpaqueNumber::NegInt(neg) => {
                // emulate negative number
                core::fmt::Write::write_char(fmt, '-')?;
                Display::fmt(neg, fmt)
            }
            OpaqueNumber::Float(float) => Display::fmt(float, fmt),
        }
    }

    #[cfg(feature = "arbitrary-precision")]
    fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
        fmt.write_str(&self.0)
    }
}

#[cfg(not(feature = "arbitrary-precision"))]
impl Serialize for Number {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self.0 {
            OpaqueNumber::PosInt(value) => serializer.serialize_u64(value),
            OpaqueNumber::NegInt(value) => {
                // in most cases the value will be compatible with i64, but in some cases we need to
                // "escalate" to i128, which not every serializer might support
                if let Ok(value) = i64::try_from(value) {
                    serializer.serialize_i64(-value)
                } else {
                    serializer.serialize_i128(-i128::from(value))
                }
            }
            OpaqueNumber::Float(value) => serializer.serialize_f64(value),
        }
    }
}

// compatability shim, this could be $deer::private::Number instead, but by using the token
// from `serde_json` we're able to also allow deserialization and serialization of the existing
// `serde_json` `Number` type
#[cfg(feature = "arbitrary-precision")]
pub(crate) const TOKEN: &str = "$serde_json::private::Number";

#[cfg(feature = "arbitrary-precision")]
impl Serialize for Number {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct as _;

        let mut ser = serializer.serialize_struct(TOKEN, 1)?;
        ser.serialize_field(TOKEN, &self.0)?;
        ser.end()
    }
}

impl Reflection for Number {
    fn schema(_: &mut Document) -> Schema {
        Schema::new("number")
    }
}

impl<'de> Deserialize<'de> for Number {
    type Reflection = Self;

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        struct Visitor;

        impl crate::Visitor<'_> for Visitor {
            type Value = Number;

            fn expecting(&self) -> Document {
                Number::reflection()
            }

            fn visit_number(self, value: Number) -> Result<Self::Value, Report<VisitorError>> {
                Ok(value)
            }

            // TODO: visit_object, needs `deserialize_any`, first need to make decision which token
            // to use!
        }

        deserializer
            .deserialize_number(Visitor)
            .change_context(DeserializeError)
    }
}
