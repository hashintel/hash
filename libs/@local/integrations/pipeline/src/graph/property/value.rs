use std::collections::HashMap;

use duckdb::types::Value;
use hash_codec::numeric::Real;
use type_system::knowledge::PropertyValue;

use crate::workspace::value::text;

/// Why a row value cannot be written as a property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum UnsupportedValue {
    #[display("blob values cannot be written as properties")]
    Blob,
    #[display("geometry values cannot be written as properties")]
    Geometry,
    #[display("interval values cannot be written as properties")]
    Interval,
    #[display("infinite and `NaN` numbers cannot be written as properties")]
    NonFiniteNumber,
    #[display("the date or time is out of range")]
    DateTimeOutOfRange,
    #[display("map keys must be text")]
    NonTextMapKey,
    #[display("the DuckDB type is not supported")]
    Unknown,
}

/// A property value read from a cell of a sink's table.
///
/// The conversion keeps the value as it is: text is not trimmed, and null converts to
/// [`PropertyValue::Null`], also inside lists, structs and maps, so their positions are kept.
#[derive(Debug, derive_more::Into)]
pub(super) struct ColumnValue(PropertyValue);

impl ColumnValue {
    /// The value, with leading and trailing whitespace removed if it is text.
    pub(super) fn into_trimmed(self) -> PropertyValue {
        let mut value = self.0;
        if let PropertyValue::String(text) = &mut value
            && text.trim().len() != text.len()
        {
            *text = text.trim().to_owned();
        }
        value
    }
}

impl TryFrom<&Value> for ColumnValue {
    type Error = UnsupportedValue;

    fn try_from(value: &Value) -> Result<Self, Self::Error> {
        let convert = |value| Self::try_from(value).map(PropertyValue::from);
        Ok(Self(match value {
            Value::Null => PropertyValue::Null,
            Value::Boolean(flag) => PropertyValue::Bool(*flag),
            Value::Text(text) | Value::Enum(text) => PropertyValue::String(text.clone()),
            Value::TinyInt(_)
            | Value::SmallInt(_)
            | Value::Int(_)
            | Value::BigInt(_)
            | Value::HugeInt(_)
            | Value::UTinyInt(_)
            | Value::USmallInt(_)
            | Value::UInt(_)
            | Value::UBigInt(_)
            | Value::UHugeInt(_)
            | Value::Float(_)
            | Value::Double(_)
            | Value::Decimal(_) => {
                PropertyValue::Number(as_number(value).ok_or(UnsupportedValue::NonFiniteNumber)?)
            }
            Value::Date32(_) | Value::Timestamp(..) | Value::Time64(..) => {
                PropertyValue::String(text(value).ok_or(UnsupportedValue::DateTimeOutOfRange)?)
            }
            Value::List(values) | Value::Array(values) => {
                PropertyValue::Array(values.iter().map(convert).collect::<Result<_, _>>()?)
            }
            Value::Struct(fields) => PropertyValue::Object(
                fields
                    .iter()
                    .map(|(name, value)| Ok((name.clone(), convert(value)?)))
                    .collect::<Result<HashMap<_, _>, _>>()?,
            ),
            Value::Map(entries) => PropertyValue::Object(
                entries
                    .iter()
                    .map(|(key, value)| {
                        let key = text(key).ok_or(UnsupportedValue::NonTextMapKey)?;
                        Ok((key, convert(value)?))
                    })
                    .collect::<Result<HashMap<_, _>, _>>()?,
            ),
            Value::Union(value) => return Self::try_from(&**value),
            Value::Blob(_) => return Err(UnsupportedValue::Blob),
            Value::Geometry(_) => return Err(UnsupportedValue::Geometry),
            Value::Interval { .. } => return Err(UnsupportedValue::Interval),
            _ => return Err(UnsupportedValue::Unknown),
        }))
    }
}

/// The number a numeric row value holds, or `None` if it is not numeric or not finite.
pub(super) fn as_number(value: &Value) -> Option<Real> {
    match value {
        Value::TinyInt(number) => Some(Real::from(*number)),
        Value::SmallInt(number) => Some(Real::from(*number)),
        Value::Int(number) => Some(Real::from(*number)),
        Value::BigInt(number) => Some(Real::from(*number)),
        Value::HugeInt(number) => Some(Real::from(*number)),
        Value::UTinyInt(number) => Some(Real::from(*number)),
        Value::USmallInt(number) => Some(Real::from(*number)),
        Value::UInt(number) => Some(Real::from(*number)),
        Value::UBigInt(number) => Some(Real::from(*number)),
        Value::UHugeInt(number) => Some(Real::from(*number)),
        // `Real` holds infinities and `NaN`, which a property cannot.
        Value::Float(number) => Real::try_from(*number).ok().and_then(finite),
        Value::Double(number) => Real::try_from(*number).ok().and_then(finite),
        Value::Decimal(number) => number.to_string().parse().ok(),
        Value::Null
        | Value::Boolean(_)
        | Value::Timestamp(..)
        | Value::Text(_)
        | Value::Blob(_)
        | Value::Geometry(_)
        | Value::Date32(_)
        | Value::Time64(..)
        | Value::Interval { .. }
        | Value::List(_)
        | Value::Enum(_)
        | Value::Struct(_)
        | Value::Array(_)
        | Value::Map(_)
        | Value::Union(_)
        | _ => None,
    }
}

/// `number` if it is finite. A property's number is written as an `f64`, so this also rejects
/// numbers too large for one.
pub(super) fn finite(number: Real) -> Option<Real> {
    number.to_f64_lossy().is_finite().then_some(number)
}
