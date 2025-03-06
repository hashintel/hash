//! High-precision numeric types based on arbitrary precision floating-point arithmetic.
//!
//! This module provides the [`Real`] type which offers high-precision arithmetic
//! operations with arbitrary precision, suitable for financial calculations and
//! scientific computing where precision is critical.
//!
//! # Features
//!
//! - Mathematical operations with arbitrary precision
//! - Conversions to and from standard Rust numeric types
//! - Serde serialization/deserialization support (with "serde" feature)
//! - PostgreSQL compatibility (with "postgres" feature)

#[cfg(feature = "postgres")]
use core::error::Error;
#[cfg(feature = "serde")]
use core::str::FromStr as _;
use core::{fmt, ops};

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use dashu_base::Sign;
use dashu_float::round::mode;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize, de};

/// Error that occurs when a value cannot be converted to a [`Real`].
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("Could not convert to a Real: {_0}")]
pub struct ConversionError(dashu_base::ConversionError);

/// A high-precision real number type backed by the `dashu_float::DBig` arbitrary-precision floating
/// point.
///
/// `Real` provides:
/// - High-precision numeric representation with a minimum precision of 64 bits
/// - Mathematical operations with arbitrary-precision results
/// - Conversions to and from standard Rust numeric types (i32, f32, f64)
/// - Optional serialization/deserialization via Serde when the "serde" feature is enabled
/// - Optional PostgreSQL integration when the "postgres" feature is enabled
///
/// # Examples
///
/// ```
/// use hash_codec::numeric::Real;
///
/// let value = Real::from_natural(42, 0);
/// let maybe_int = value.to_i32(); // Some(42)
/// let float_val = value.to_f64(); // 42.0
/// ```
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Real(dashu_float::DBig);

const MIN_PRECISION: usize = 64;

impl Real {
    /// Creates a new `Real` from a natural number with given significand and exponent.
    ///
    /// Constructs a value representing: `significand * 10^exponent`
    ///
    /// # Arguments
    ///
    /// * `significand` - The significand (mantissa) of the real number
    /// * `exponent` - The power of 10 to multiply the significand by
    #[must_use]
    pub const fn from_natural(significand: u32, exponent: isize) -> Self {
        #[expect(clippy::as_underscore, reason = "Type type differs between platforms")]
        Self(dashu_float::DBig::from_parts_const(
            Sign::Positive,
            significand as _,
            exponent,
            Some(MIN_PRECISION),
        ))
    }

    #[must_use]
    pub fn to_i32(&self) -> Option<i32> {
        self.0.to_int().value().try_into().ok()
    }

    #[must_use]
    pub fn to_f32(&self) -> f32 {
        self.0.to_f32().value()
    }

    #[must_use]
    pub fn to_f64(&self) -> f64 {
        self.0.to_f64().value()
    }
}

#[cfg(feature = "postgres")]
impl<'a> FromSql<'a> for Real {
    postgres_types::accepts!(FLOAT4, FLOAT8);

    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        match *ty {
            Type::FLOAT4 => Ok(Self::try_from(<f32 as FromSql>::from_sql(ty, raw)?)?),
            Type::FLOAT8 => Ok(Self::try_from(<f64 as FromSql>::from_sql(ty, raw)?)?),
            _ => Err("Invalid type".into()),
        }
    }
}

#[cfg(feature = "postgres")]
impl ToSql for Real {
    postgres_types::to_sql_checked!();

    postgres_types::accepts!(FLOAT4, FLOAT8);

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        match *ty {
            Type::FLOAT4 => <f32 as ToSql>::to_sql(&self.to_f32(), ty, out),
            Type::FLOAT8 => <f64 as ToSql>::to_sql(&self.to_f64(), ty, out),
            _ => Err("Invalid type".into()),
        }
    }
}

#[cfg(feature = "utoipa")]
impl utoipa::ToSchema<'_> for Real {
    fn schema() -> (
        &'static str,
        utoipa::openapi::RefOr<utoipa::openapi::Schema>,
    ) {
        (
            "Real",
            utoipa::openapi::ObjectBuilder::new()
                .schema_type(utoipa::openapi::SchemaType::Number)
                .build()
                .into(),
        )
    }
}

#[cfg(feature = "serde")]
struct RealVisitor;
#[cfg(feature = "serde")]
impl de::Visitor<'_> for RealVisitor {
    type Value = Real;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        write!(formatter, "a number or formatted Real string")
    }

    fn visit_u8<E>(self, value: u8) -> Result<Real, E>
    where
        E: de::Error,
    {
        Ok(Real::from(value))
    }

    fn visit_u16<E>(self, value: u16) -> Result<Real, E>
    where
        E: de::Error,
    {
        Ok(Real::from(value))
    }

    fn visit_u32<E>(self, value: u32) -> Result<Real, E>
    where
        E: de::Error,
    {
        Ok(Real::from(value))
    }

    fn visit_u64<E>(self, value: u64) -> Result<Real, E>
    where
        E: de::Error,
    {
        Ok(Real::from(value))
    }

    fn visit_u128<E>(self, value: u128) -> Result<Real, E>
    where
        E: de::Error,
    {
        Ok(Real::from(value))
    }

    fn visit_i8<E>(self, value: i8) -> Result<Real, E>
    where
        E: de::Error,
    {
        Ok(Real::from(value))
    }

    fn visit_i16<E>(self, value: i16) -> Result<Real, E>
    where
        E: de::Error,
    {
        Ok(Real::from(value))
    }

    fn visit_i32<E>(self, value: i32) -> Result<Real, E>
    where
        E: de::Error,
    {
        Ok(Real::from(value))
    }

    fn visit_i64<E>(self, value: i64) -> Result<Real, E>
    where
        E: de::Error,
    {
        Ok(Real::from(value))
    }

    fn visit_i128<E>(self, value: i128) -> Result<Real, E>
    where
        E: de::Error,
    {
        Ok(Real::from(value))
    }

    fn visit_f32<E>(self, value: f32) -> Result<Real, E>
    where
        E: de::Error,
    {
        Real::try_from(value).map_err(E::custom)
    }

    fn visit_f64<E>(self, value: f64) -> Result<Real, E>
    where
        E: de::Error,
    {
        Real::try_from(value).map_err(E::custom)
    }

    fn visit_str<E>(self, value: &str) -> Result<Real, E>
    where
        E: de::Error,
    {
        dashu_float::DBig::from_str(value)
            .map(Real)
            .map_err(E::custom)
    }
}

#[cfg(feature = "serde")]
impl<'de> Deserialize<'de> for Real {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(RealVisitor)
    }
}

#[cfg(feature = "serde")]
impl Serialize for Real {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.to_f64().value().serialize(serializer)
    }
}

impl PartialEq<&Self> for Real {
    fn eq(&self, other: &&Self) -> bool {
        self.0 == other.0
    }
}

impl PartialEq<Real> for &Real {
    fn eq(&self, other: &Real) -> bool {
        self.0 == other.0
    }
}

impl fmt::Display for Real {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0.to_f64().value(), fmt)
    }
}

macro_rules! impl_real_from_primitive_int {
    ($primitive:ty) => {
        impl From<$primitive> for Real {
            fn from(primitive: $primitive) -> Self {
                Self(
                    dashu_float::DBig::from(primitive)
                        .with_precision(MIN_PRECISION)
                        .value(),
                )
            }
        }

        impl From<&$primitive> for Real {
            fn from(primitive: &$primitive) -> Self {
                Self::from(*primitive)
            }
        }
    };
}

impl_real_from_primitive_int!(u8);
impl_real_from_primitive_int!(u16);
impl_real_from_primitive_int!(u32);
impl_real_from_primitive_int!(u64);
impl_real_from_primitive_int!(u128);
impl_real_from_primitive_int!(i8);
impl_real_from_primitive_int!(i16);
impl_real_from_primitive_int!(i32);
impl_real_from_primitive_int!(i64);
impl_real_from_primitive_int!(i128);

macro_rules! impl_real_from_primitive_float {
    ($primitive:ty) => {
        impl TryFrom<$primitive> for Real {
            type Error = ConversionError;

            fn try_from(primitive: $primitive) -> Result<Self, Self::Error> {
                Ok(Self(
                    dashu_float::FBig::<mode::Zero>::try_from(primitive)
                        .map_err(ConversionError)?
                        .with_precision(MIN_PRECISION)
                        .value()
                        .to_decimal()
                        .value(),
                ))
            }
        }

        impl TryFrom<&$primitive> for Real {
            type Error = ConversionError;

            fn try_from(primitive: &$primitive) -> Result<Self, Self::Error> {
                Self::try_from(*primitive)
            }
        }
    };
}

impl_real_from_primitive_float!(f32);
impl_real_from_primitive_float!(f64);

impl ops::Add for Real {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        Self(self.0.add(rhs.0))
    }
}

impl ops::Sub for Real {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self {
        Self(self.0.sub(rhs.0))
    }
}

impl ops::Mul for Real {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self {
        Self(self.0.mul(rhs.0))
    }
}

impl ops::Div for Real {
    type Output = Self;

    fn div(self, rhs: Self) -> Self {
        Self(self.0.div(rhs.0))
    }
}

impl ops::Rem for &Real {
    type Output = Real;

    fn rem(self, rhs: Self) -> Real {
        Real((&self.0).rem(&rhs.0))
    }
}

mod tests {
    use super::Real;

    #[test]
    fn from_natural() {
        let real = Real::from_natural(42, 0);
        assert_eq!(real.to_i32(), Some(42));
        assert!(
            (real.to_f64() - 42.0).abs() < f64::EPSILON,
            "Expected real.to_f64() to be approximately 42.0"
        );
    }

    #[test]
    fn operations() {
        let value1 = Real::from_natural(10, 0);
        let value2 = Real::from_natural(5, 0);

        // Addition
        let sum = value1.clone() + value2.clone();
        assert_eq!(sum.to_i32(), Some(15));

        // Subtraction
        let diff = value1.clone() - value2.clone();
        assert_eq!(diff.to_i32(), Some(5));

        // Multiplication
        let product = value1.clone() * value2.clone();
        assert_eq!(product.to_i32(), Some(50));

        // Division
        let quotient = value1 / value2;
        assert_eq!(quotient.to_i32(), Some(2));
    }

    #[test]
    fn ordering() {
        let value1 = Real::from_natural(10, 0);
        let value2 = Real::from_natural(5, 0);
        let value3 = Real::from_natural(10, 0);

        assert!(value1 > value2);
        assert!(value2 < value1);
        assert_eq!(value1, value3);
        assert!(value1 >= value3);
        assert!(value1 <= value3);
    }
}
