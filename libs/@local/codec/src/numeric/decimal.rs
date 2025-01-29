use core::{fmt, hash::Hash, ops};
use std::str::FromStr;

use bigdecimal::ToPrimitive as _;
use dashu_base::{Sign, Signed};
use dashu_float::round::mode;
use serde::{Deserialize, Serialize, de, ser::SerializeStruct};
type NumType = dashu_float::DBig;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Decimal(NumType);

impl Hash for Decimal {
    fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
        self.0.to_string().hash(state)
    }
}

struct DecimalVisitor;
impl<'de> de::Visitor<'de> for DecimalVisitor {
    type Value = Decimal;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        write!(formatter, "a number or formatted decimal string")
    }

    fn visit_str<E>(self, value: &str) -> Result<Decimal, E>
    where
        E: de::Error,
    {
        dbg!(NumType::from_str(value).map(Decimal).map_err(E::custom))
    }

    fn visit_u64<E>(self, value: u64) -> Result<Decimal, E>
    where
        E: de::Error,
    {
        Ok(Decimal(NumType::from(value)))
    }

    fn visit_i64<E>(self, value: i64) -> Result<Decimal, E>
    where
        E: de::Error,
    {
        Ok(Decimal(NumType::from(value)))
    }

    fn visit_u128<E>(self, value: u128) -> Result<Decimal, E>
    where
        E: de::Error,
    {
        Ok(Decimal(NumType::from(value)))
    }

    fn visit_i128<E>(self, value: i128) -> Result<Decimal, E>
    where
        E: de::Error,
    {
        Ok(Decimal(NumType::from(value)))
    }

    fn visit_f32<E>(self, value: f32) -> Result<Decimal, E>
    where
        E: de::Error,
    {
        dashu_float::FBig::<mode::Zero>::try_from(value)
            .map(|float| Decimal(float.to_decimal().value()))
            .map_err(E::custom)
    }

    fn visit_f64<E>(self, value: f64) -> Result<Decimal, E>
    where
        E: de::Error,
    {
        dashu_float::FBig::<mode::Zero>::try_from(value)
            .map(|float| Decimal(float.to_decimal().value()))
            .map_err(E::custom)
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: de::MapAccess<'de>,
    {
        match map.next_key::<&str>() {
            Ok(Some("$serde_json::private::Number")) => map.next_value::<Decimal>(),
            _ => Err(de::Error::invalid_type(de::Unexpected::Map, &self)),
        }
    }
}

impl<'de> Deserialize<'de> for Decimal {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(DecimalVisitor)
    }
}

impl Serialize for Decimal {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("$serde_json::private::Number", 1)?;
        s.serialize_field("$serde_json::private::Number", &self.0.to_string())?;
        s.end()
    }
}

impl Decimal {
    #[must_use]
    pub fn from_natural(significand: u128, exponent: isize) -> Self {
        // Self(bigdecimal::BigDecimal::from_biguint(
        //     digits.into(),
        //     -exponent,
        // ))
        Self(NumType::from_parts_const(
            Sign::Positive,
            significand,
            exponent,
            Some(16),
        ))
    }

    #[must_use]
    pub fn from_integral(significand: i128, exponent: isize) -> Self {
        // Self(bigdecimal::BigDecimal::from_bigint(
        //     digits.into(),
        //     -exponent,
        // ))
        Self(NumType::from_parts_const(
            significand.sign(),
            significand as u128,
            exponent,
            Some(16),
        ))
    }

    // #[must_use]
    // pub fn to_i32(&self) -> Option<i32> {
    //     self.0.to_i32()
    // }

    // #[must_use]
    // pub fn to_f32(&self) -> Option<f32> {
    //     self.0.to_f32()
    // }
}

impl PartialEq<&Self> for Decimal {
    fn eq(&self, other: &&Self) -> bool {
        self.0 == other.0
    }
}

impl PartialEq<Decimal> for &Decimal {
    fn eq(&self, other: &Decimal) -> bool {
        self.0 == other.0
    }
}

impl fmt::Display for Decimal {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0.to_decimal().value(), fmt)
    }
}

macro_rules! impl_int_primitive_traits {
    ($primitive:ty) => {
        impl From<$primitive> for Decimal {
            fn from(int: $primitive) -> Self {
                Self(NumType::from(int).with_precision(100).value())
            }
        }
        // impl From<&$primitive> for Decimal {
        //     fn from(int: &$primitive) -> Self {
        //         Self(int.into())
        //     }
        // }
    };
}

impl_int_primitive_traits!(u8);
impl_int_primitive_traits!(u16);
impl_int_primitive_traits!(u32);
// impl_int_primitive_traits!(u64);
// impl_int_primitive_traits!(u128);
impl_int_primitive_traits!(i8);
impl_int_primitive_traits!(i16);
impl_int_primitive_traits!(i32);
// impl_int_primitive_traits!(i64);
// impl_int_primitive_traits!(i128);

impl ops::Add for Decimal {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        Self(self.0.add(rhs.0))
    }
}

impl ops::Sub for Decimal {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self {
        Self(self.0.sub(rhs.0))
    }
}

impl ops::Mul for Decimal {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self {
        Self(self.0.mul(rhs.0))
    }
}

impl ops::Div for Decimal {
    type Output = Self;

    fn div(self, rhs: Self) -> Self {
        Self(self.0.div(rhs.0))
    }
}

impl ops::Rem for &Decimal {
    type Output = Decimal;

    fn rem(self, rhs: Self) -> Decimal {
        Decimal((&self.0).rem(&rhs.0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // #[test]
    // fn arbitrary_value_precision() {
    //     let string = "0.100000000000000000000000000000000000001";
    //     let number =
    //         serde_json::from_str::<Decimal>(string).expect("should be able to parse object");
    //     assert_eq!(
    //         number,
    //         Decimal::from_natural(100_000_000_000_000_000_000_000_000_000_000_000_001, -39),
    //     );
    // }

    #[test]
    fn calculation() {
        let lhs = serde_json::from_str::<Decimal>("5").expect("should be able to parse object");
        let rhs = serde_json::from_str::<Decimal>("9").expect("should be able to parse object");
        let lhs = Decimal(lhs.0.with_precision(20).value());
        let result = serde_json::from_str::<Decimal>(
            "0.300000000000000000000000000000000000000000000000000000000003",
        )
        .expect("should be able to parse object");
        assert_eq!(lhs / rhs, result,);
    }
}
