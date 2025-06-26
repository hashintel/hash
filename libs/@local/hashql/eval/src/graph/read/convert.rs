use alloc::borrow::Cow;

use hash_graph_store::filter::Parameter;
use hashql_core::{literal::LiteralKind, value::Value};
use type_system::knowledge::PropertyValue;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display)]
pub(crate) enum ConversionError {
    #[display("dictionary keys must be strings")]
    DictKeyNotString,
}

fn value_to_string(value: &Value<'_>) -> Option<String> {
    match value {
        Value::Primitive(LiteralKind::String(string)) => Some(string.as_str().to_owned()),
        Value::Opaque(opaque) => value_to_string(opaque.value()),
        _ => None,
    }
}

fn value_to_property_value(value: &Value<'_>) -> Result<PropertyValue, ConversionError> {
    match value {
        Value::Primitive(LiteralKind::Null) => Ok(PropertyValue::Null),
        &Value::Primitive(LiteralKind::Boolean(bool)) => Ok(PropertyValue::Bool(bool)),
        Value::Primitive(LiteralKind::Integer(integer)) => {
            Ok(PropertyValue::Number(integer.as_real()))
        }
        Value::Primitive(LiteralKind::Float(float)) => Ok(PropertyValue::Number(float.as_real())),
        Value::Primitive(LiteralKind::String(string)) => {
            Ok(PropertyValue::String(string.as_str().to_owned()))
        }
        Value::Struct(r#struct) => r#struct
            .iter()
            .map(|(key, value)| {
                let key = key.as_str().to_owned();
                let value = value_to_property_value(value)?;

                Ok((key, value))
            })
            .try_collect()
            .map(PropertyValue::Object),
        Value::Tuple(tuple) => tuple
            .iter()
            .map(value_to_property_value)
            .try_collect()
            .map(PropertyValue::Array),
        Value::List(list) => list
            .iter()
            .map(value_to_property_value)
            .try_collect()
            .map(PropertyValue::Array),
        Value::Dict(dict) => dict
            .iter()
            .map(|(key, value)| {
                let key = value_to_string(key).ok_or(ConversionError::DictKeyNotString)?;
                let value = value_to_property_value(value)?;

                Ok((key, value))
            })
            .try_collect()
            .map(PropertyValue::Object),
        Value::Opaque(opaque) => value_to_property_value(opaque.value()),
    }
}

pub(super) fn convert_value_to_parameter<'heap>(
    value: &Value<'heap>,
) -> Result<Parameter<'heap>, ConversionError> {
    match value {
        &Value::Primitive(LiteralKind::Boolean(bool)) => Ok(Parameter::Boolean(bool)),
        Value::Primitive(LiteralKind::Integer(integer)) => {
            Ok(Parameter::Decimal(integer.as_real()))
        }
        Value::Primitive(LiteralKind::Float(float)) => Ok(Parameter::Decimal(float.as_real())),
        Value::Primitive(LiteralKind::String(string)) => {
            Ok(Parameter::Text(Cow::Borrowed(string.value.unwrap())))
        }
        Value::Primitive(LiteralKind::Null)
        | Value::Struct(_)
        | Value::Tuple(_)
        | Value::List(_)
        | Value::Dict(_) => value_to_property_value(value).map(Parameter::Any),
        Value::Opaque(opaque) => convert_value_to_parameter(opaque.value()),
    }
}
