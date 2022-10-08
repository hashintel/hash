#[cfg(feature = "arbitrary-precision")]
use num_bigint::{BigInt, BigUint, ToBigInt, ToBigUint};
use num_traits::{FromPrimitive, ToPrimitive};
#[cfg(feature = "arbitrary-precision")]
use rust_decimal::Decimal;

// This indirection helps us to "disguise" the underlying storage, enabling us to seamlessly convert
// and change the underlying storage at a later point in time, if required.
#[derive(Debug, Clone)]
enum OpaqueNumber {
    Int(i64),
    #[cfg(feature = "arbitrary-precision")]
    BigInt(BigInt),

    Float(f64),
    #[cfg(feature = "arbitrary-precision")]
    Decimal(Decimal),
}

/// Used to represent any rational number.
///
/// This type simplifies the use of numbers internally and the implementation of custom
/// [`Deserializer`]s, as one only needs to convert to [`Number`], instead of converting to every
/// single primitive possible.
///
/// This type also enables easy coercion of values at deserialization time.
///
/// Without the `arbitrary-precision` feature enabled, integers are limited to `i64`, while floats
/// are stored as `f64`, larger values are only supported using the aforementioned feature and are
/// stored as [`BigInt`], [`Decimal`] respectively, there is no guarantee that the storage of
/// arbitrarily sized values will be the same across breaking revisions.
///
/// Even with `arbitrary-precision` enabled, this type will try to fit the converted value into a
/// `i64`, if that isn't possible it will fallback to a [`BigInt`].
///
/// [`Deserializer`]: crate::Deserializer
#[derive(Debug, Clone)]
pub struct Number(OpaqueNumber);

impl FromPrimitive for Number {
    fn from_isize(n: isize) -> Option<Self> {
        if let Ok(ok) = i64::try_from(n) {
            return Some(Self(OpaqueNumber::Int(ok)));
        }

        #[cfg(feature = "arbitrary-precision")]
        return Some(Self(OpaqueNumber::BigInt(n.into())));

        #[cfg(not(feature = "arbitrary-precision"))]
        return None;
    }

    fn from_i8(n: i8) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(i64::from(n))))
    }

    fn from_i16(n: i16) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(i64::from(n))))
    }

    fn from_i32(n: i32) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(i64::from(n))))
    }

    fn from_i64(n: i64) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(n)))
    }

    fn from_i128(n: i128) -> Option<Self> {
        if let Ok(ok) = i64::try_from(n) {
            return Some(Self(OpaqueNumber::Int(ok)));
        }

        #[cfg(feature = "arbitrary-precision")]
        return Some(Self(OpaqueNumber::BigInt(n.into())));

        #[cfg(not(feature = "arbitrary-precision"))]
        return None;
    }

    fn from_usize(n: usize) -> Option<Self> {
        if let Ok(ok) = i64::try_from(n) {
            return Some(Self(OpaqueNumber::Int(ok)));
        }

        #[cfg(feature = "arbitrary-precision")]
        return Some(Self(OpaqueNumber::BigInt(n.into())));

        #[cfg(not(feature = "arbitrary-precision"))]
        return None;
    }

    fn from_u8(n: u8) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(i64::from(n))))
    }

    fn from_u16(n: u16) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(i64::from(n))))
    }

    fn from_u32(n: u32) -> Option<Self> {
        Some(Self(OpaqueNumber::Int(i64::from(n))))
    }

    fn from_u64(n: u64) -> Option<Self> {
        if let Ok(ok) = i64::try_from(n) {
            return Some(Self(OpaqueNumber::Int(ok)));
        }

        #[cfg(feature = "arbitrary-precision")]
        return Some(Self(OpaqueNumber::BigInt(n.into())));

        #[cfg(not(feature = "arbitrary-precision"))]
        return None;
    }

    fn from_u128(n: u128) -> Option<Self> {
        if let Ok(ok) = i64::try_from(n) {
            return Some(Self(OpaqueNumber::Int(ok)));
        }

        #[cfg(feature = "arbitrary-precision")]
        return Some(Self(OpaqueNumber::BigInt(n.into())));

        #[cfg(not(feature = "arbitrary-precision"))]
        return None;
    }

    fn from_f32(n: f32) -> Option<Self> {
        Some(Self(OpaqueNumber::Float(f64::from(n))))
    }

    fn from_f64(n: f64) -> Option<Self> {
        Some(Self(OpaqueNumber::Float(n)))
    }
}

macro_rules! to_int {
    (#internal, $ty:ty; $method:ident) => {
        fn $method(&self) -> Option<$ty> {
            match &self.0 {
                OpaqueNumber::Int(x) => x.$method(),
                #[cfg(feature = "arbitrary-precision")]
                OpaqueNumber::BigInt(x) => x.$method(),

                // they return None because the conversion from int to float is not lossless
                OpaqueNumber::Float(_) => None,
                #[cfg(feature = "arbitrary-precision")]
                OpaqueNumber::Decimal(_) => None,
            }
        }
    };
    ($($ty:ty; $method:ident),*) => {
        $(to_int!(#internal, $ty; $method);)*
    }
}

impl ToPrimitive for Number {
    to_int!(
        isize; to_isize,
        i8; to_i8,
        i16; to_i16,
        i32; to_i32,
        i64; to_i64,
        i128; to_i128,
        usize; to_usize,
        u8; to_u8,
        u16; to_u16,
        u32; to_u32,
        u64; to_u64,
        u128; to_u128
    );

    fn to_f32(&self) -> Option<f32> {
        match &self.0 {
            OpaqueNumber::Int(x) => x.to_f32(),
            #[cfg(feature = "arbitrary-precision")]
            OpaqueNumber::BigInt(x) => x.to_f32(),

            OpaqueNumber::Float(x) => x.to_f32(),
            #[cfg(feature = "arbitrary-precision")]
            OpaqueNumber::Decimal(x) => x.to_f32(),
        }
    }

    fn to_f64(&self) -> Option<f64> {
        match &self.0 {
            OpaqueNumber::Int(x) => x.to_f64(),
            #[cfg(feature = "arbitrary-precision")]
            OpaqueNumber::BigInt(x) => x.to_f64(),

            OpaqueNumber::Float(x) => Some(*x),
            #[cfg(feature = "arbitrary-precision")]
            OpaqueNumber::Decimal(x) => x.to_f64(),
        }
    }
}

macro_rules! impl_from {
    (#internal, $ty:ty) => {
        impl From<$ty> for Number {
            fn from(value: $ty) -> Self {
                Self(OpaqueNumber::Int(i64::from(value)))
            }
        }
    };

    (#internal, $modifier:literal, $ty:ty) => {
        impl From<$ty> for Number {
            fn from(value: $ty) -> Self {
                Self(OpaqueNumber::Float(f64::from(value)))
            }
        }
    };

    ([$($($modifier:literal :)? $ty:ty),*]) => {
        $(impl_from!(#internal, $($modifier ,)? $ty);)*
    }
}

impl_from!([i8, i16, i32, i64, u8, u16, u32, "float": f32, "float": f64]);

#[cfg(feature = "arbitrary-precision")]
impl From<BigInt> for Number {
    fn from(value: BigInt) -> Self {
        value.to_i64().map_or_else(
            || Self(OpaqueNumber::BigInt(value)),
            |value| Self(OpaqueNumber::Int(value)),
        )
    }
}

#[cfg(feature = "arbitrary-precision")]
impl ToBigInt for Number {
    fn to_bigint(&self) -> Option<BigInt> {
        match &self.0 {
            OpaqueNumber::Int(int) => int.to_bigint(),
            OpaqueNumber::BigInt(int) => Some(int.clone()),
            OpaqueNumber::Float(float) => float.to_bigint(),
            OpaqueNumber::Decimal(_) => None,
        }
    }
}

#[cfg(feature = "arbitrary-precision")]
impl ToBigUint for Number {
    fn to_biguint(&self) -> Option<BigUint> {
        match &self.0 {
            OpaqueNumber::Int(int) => int.to_biguint(),
            OpaqueNumber::BigInt(int) => int.to_biguint(),
            OpaqueNumber::Float(float) => float.to_biguint(),
            OpaqueNumber::Decimal(_) => None,
        }
    }
}

#[cfg(feature = "arbitrary-precision")]
impl From<Decimal> for Number {
    fn from(value: Decimal) -> Self {
        Self(OpaqueNumber::Decimal(value))
    }
}
